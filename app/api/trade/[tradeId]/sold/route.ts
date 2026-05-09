import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { invalidateCache } from "@/app/lib/cache";

export const dynamic = "force-dynamic";

// POST /api/trade/[tradeId]/sold — 거래 status 변경
// body: { sold?: boolean, status?: 'active'|'reserved'|'sold'|'hidden' }
// - sold: true → status='sold' (legacy)
// - sold: false → status='active' (legacy)
// - status: 명시 시 그 값 그대로 (active/reserved/sold/hidden 만 허용)
const ALLOWED_STATUSES = new Set(["active", "reserved", "sold", "hidden"]);
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

  const body = await request.json().catch(() => null);
  const requestedStatus: string | undefined = typeof body?.status === "string" ? body.status : undefined;
  const sold = !!body?.sold;

  const { data: post } = await supabase
    .from("trade_posts")
    .select("firebase_uid, status")
    .eq("id", id)
    .maybeSingle();

  if (!post) return NextResponse.json({ error: "글을 찾을 수 없습니다" }, { status: 404 });
  if (post.firebase_uid !== user.uid) {
    return NextResponse.json({ error: "본인 글만 변경할 수 있습니다" }, { status: 403 });
  }
  if (post.status === "deleted") {
    return NextResponse.json({ error: "삭제된 글은 변경할 수 없습니다" }, { status: 400 });
  }

  // status 명시 시 그 값 (검증). 없으면 sold 토글 (레거시 호환).
  let newStatus: string;
  if (requestedStatus) {
    if (!ALLOWED_STATUSES.has(requestedStatus)) {
      return NextResponse.json({ error: "허용되지 않는 status" }, { status: 400 });
    }
    newStatus = requestedStatus;
  } else {
    newStatus = sold ? "sold" : "active";
  }
  if (post.status === newStatus) {
    return NextResponse.json({ success: true, status: newStatus, unchanged: true });
  }

  const { error } = await (supabase as any)
    .from("trade_posts")
    .update({ status: newStatus })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await invalidateCache("trade:*").catch(() => {});
  return NextResponse.json({ success: true, status: newStatus });
}
