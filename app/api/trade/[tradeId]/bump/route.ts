import { supabase } from "@/app/lib/supabase";
import { NextResponse, after } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { invalidateCache } from "@/app/lib/cache";
import { sendPushToUser } from "@/app/lib/notifications";

export const dynamic = "force-dynamic";

// 카테고리별 끌어올림 쿨다운 (밀리초)
// 중고거래(equipment)·운동용품(gear): 3일, 센터매매(center): 2일
const COOLDOWN_MS: Record<string, number> = {
  equipment: 3 * 24 * 60 * 60 * 1000,
  gear: 3 * 24 * 60 * 60 * 1000,
  center: 2 * 24 * 60 * 60 * 1000,
};

// POST /api/trade/[tradeId]/bump — 거래글 끌어올리기 (당근 마켓 패턴)
// - 본인 글에서만 가능
// - 카테고리별 쿨다운 내면 거절 + 남은 시간 응답
// - 통과 시 bumped_at = NOW() → effective_at(generated) 갱신 → 리스트 상단으로 이동
// - 푸시/키워드 알림은 보내지 않음 (이미 게시된 글의 재노출이라 사용자 명시 결정)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tradeId: string }> },
) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { tradeId } = await params;
  const id = Number(tradeId);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });
  }

  // 선택 필드 — 가격 함께 낮추기
  // body: { new_price_manwon?: number }  (중고거래, 만원 단위 정수)
  // body: { new_price_won?: number }     (운동용품, 원 단위 정수)
  const body = await request.json().catch(() => ({}));
  const rawNewPriceManwon = body?.new_price_manwon;
  const newPriceManwon = typeof rawNewPriceManwon === "number" && Number.isFinite(rawNewPriceManwon)
    ? Math.max(0, Math.floor(rawNewPriceManwon))
    : null;
  const rawNewPriceWon = body?.new_price_won;
  const newPriceWon = typeof rawNewPriceWon === "number" && Number.isFinite(rawNewPriceWon)
    ? Math.max(0, Math.floor(rawNewPriceWon))
    : null;

  const { data: post } = await supabase
    .from("trade_posts")
    .select("firebase_uid, category, status, bumped_at, price_manwon, price_won, product_name, title")
    .eq("id", id)
    .maybeSingle();

  if (!post) return NextResponse.json({ error: "글을 찾을 수 없습니다" }, { status: 404 });
  if (post.firebase_uid !== user.uid) {
    return NextResponse.json({ error: "본인 글만 끌어올릴 수 있습니다" }, { status: 403 });
  }
  if (post.status === "deleted") {
    return NextResponse.json({ error: "삭제된 글은 끌어올릴 수 없습니다" }, { status: 400 });
  }

  const cooldownMs = COOLDOWN_MS[post.category] ?? COOLDOWN_MS.equipment;
  const now = Date.now();

  if (post.bumped_at) {
    const last = new Date(post.bumped_at).getTime();
    const elapsed = now - last;
    if (elapsed < cooldownMs) {
      const remainingMs = cooldownMs - elapsed;
      return NextResponse.json(
        {
          error: "cooldown",
          remainingMs,
          cooldownMs,
        },
        { status: 429 },
      );
    }
  }

  const nowIso = new Date(now).toISOString();

  // 가격 변경 동반? (중고거래 = price_manwon, 운동용품 = price_won)
  const willChangeEq =
    post.category === "equipment" &&
    newPriceManwon !== null &&
    typeof post.price_manwon === "number" &&
    newPriceManwon !== post.price_manwon &&
    newPriceManwon >= 0;
  const willChangeGear =
    post.category === "gear" &&
    newPriceWon !== null &&
    typeof post.price_won === "number" &&
    newPriceWon !== post.price_won &&
    newPriceWon >= 0;
  const willChangePrice = willChangeEq || willChangeGear;
  // oldWon / newWon — 원 단위로 통일해 알림·계산에 사용
  const oldWon = willChangeEq
    ? (post.price_manwon as number) * 10000
    : willChangeGear
      ? (post.price_won as number)
      : null;
  const newWon = willChangeEq
    ? (newPriceManwon as number) * 10000
    : willChangeGear
      ? (newPriceWon as number)
      : null;
  const willDropPrice =
    willChangePrice && oldWon !== null && newWon !== null && newWon < oldWon && newWon > 0;

  const updateRow: Record<string, unknown> = { bumped_at: nowIso };
  if (willChangeEq && newPriceManwon !== null) {
    updateRow.price_manwon = newPriceManwon;
  }
  if (willChangeGear && newPriceWon !== null) {
    updateRow.price_won = newPriceWon;
  }

  const { error } = await (supabase as any)
    .from("trade_posts")
    .update(updateRow)
    .eq("id", id);

  if (error) {
    console.error("bump update error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await invalidateCache("trade:*").catch(() => {});

  // 가격 인하 시 → 북마크 사용자에게 푸시 (PATCH 라우트와 동일 룰, after() 백그라운드)
  if (willDropPrice && oldWon !== null && newWon !== null) {
    const oldWonFinal = oldWon;
    const newWonFinal = newWon;
    const ownerUid = post.firebase_uid;
    const productLabel = post.product_name || post.title || "거래글";
    after(async () => {
      try {
        const { data: bookmarks } = await (supabase as any)
          .from("trade_post_bookmarks")
          .select("firebase_uid")
          .eq("trade_post_id", id);
        const uids = Array.from(
          new Set(
            ((bookmarks as { firebase_uid: string }[] | null) || [])
              .map((b) => b.firebase_uid)
              .filter((u) => u && u !== ownerUid)
          )
        );
        if (uids.length === 0) return;

        const { data: blocks } = await (supabase as any)
          .from("user_blocks")
          .select("blocker_uid, blocked_uid")
          .or(`blocker_uid.eq.${ownerUid},blocked_uid.eq.${ownerUid}`);
        const blocked = new Set<string>();
        for (const r of (blocks || []) as { blocker_uid: string; blocked_uid: string }[]) {
          if (r.blocker_uid === ownerUid) blocked.add(r.blocked_uid);
          if (r.blocked_uid === ownerUid) blocked.add(r.blocker_uid);
        }
        const targets = uids.filter((u) => !blocked.has(u));
        if (targets.length === 0) return;

        // 가격 표시 — 원 단위. 1억 이상은 단축 표기.
        const fmt = (won: number) => {
          if (won >= 100000000) {
            const eok = Math.floor(won / 100000000);
            const rest = won % 100000000;
            const manwon = Math.floor(rest / 10000);
            return manwon === 0 ? `${eok}억원` : `${eok}억 ${manwon.toLocaleString()}만원`;
          }
          return `${won.toLocaleString()}원`;
        };
        const titleMsg = "관심 거래글 가격 인하";
        const bodyMsg = `${productLabel} ${fmt(oldWonFinal)} → ${fmt(newWonFinal)}`;

        await Promise.all(
          targets.map((uid) =>
            sendPushToUser(uid, "trade_price_drop", titleMsg, bodyMsg, {
              type: "trade_price_drop",
              trade_id: String(id),
            }).catch(() => {})
          )
        );
      } catch (err) {
        console.error("[trade bump+drop notify] failed:", err);
      }
    });
  }

  return NextResponse.json({
    success: true,
    bumped_at: nowIso,
    cooldownMs,
    price_changed: willChangePrice,
    price_dropped: willDropPrice,
    new_price_manwon: willChangeEq ? newPriceManwon : null,
    new_price_won: willChangeGear ? newPriceWon : null,
  });
}
