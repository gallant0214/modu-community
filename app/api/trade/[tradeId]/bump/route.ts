import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { invalidateCache } from "@/app/lib/cache";

export const dynamic = "force-dynamic";

// 카테고리별 끌어올림 쿨다운 (밀리초)
// 중고거래(equipment): 3일, 센터매매(center): 2일
const COOLDOWN_MS: Record<string, number> = {
  equipment: 3 * 24 * 60 * 60 * 1000,
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

  const { data: post } = await supabase
    .from("trade_posts")
    .select("firebase_uid, category, status, bumped_at")
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
  const { error } = await supabase
    .from("trade_posts")
    .update({ bumped_at: nowIso })
    .eq("id", id);

  if (error) {
    console.error("bump update error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await invalidateCache("trade:*").catch(() => {});
  return NextResponse.json({ success: true, bumped_at: nowIso, cooldownMs });
}
