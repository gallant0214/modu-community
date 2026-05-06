import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { invalidateCache } from "@/app/lib/cache";

export const dynamic = "force-dynamic";

// GET /api/trade/[tradeId] — 단건 조회 (+ 로그인 시 is_bookmarked 동기화)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tradeId: string }> }
) {
  const { tradeId } = await params;
  const id = Number(tradeId);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });
  }

  const { data: post, error } = await supabase
    .from("trade_posts")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !post) {
    return NextResponse.json({ error: "글을 찾을 수 없습니다" }, { status: 404 });
  }

  let is_bookmarked = false;
  const user = await verifyAuth(request).catch(() => null);
  if (user) {
    const { data: b } = await supabase
      .from("trade_post_bookmarks")
      .select("id")
      .eq("trade_post_id", id)
      .eq("firebase_uid", user.uid)
      .maybeSingle();
    is_bookmarked = !!b;
  }

  const is_owner = !!user && user.uid === post.firebase_uid;
  return NextResponse.json({ ...post, is_bookmarked, is_owner });
}

// DELETE /api/trade/[tradeId] — 본인 또는 관리자만 삭제 (소프트 = status='deleted')
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ tradeId: string }> }
) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { tradeId } = await params;
  const id = Number(tradeId);

  const { data: post } = await supabase
    .from("trade_posts")
    .select("firebase_uid")
    .eq("id", id)
    .single();

  if (!post) return NextResponse.json({ error: "글을 찾을 수 없습니다" }, { status: 404 });
  if (post.firebase_uid !== user.uid) {
    return NextResponse.json({ error: "본인 글만 삭제할 수 있습니다" }, { status: 403 });
  }

  const { error } = await supabase
    .from("trade_posts")
    .update({ status: "deleted" })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await invalidateCache("trade:*").catch(() => {});
  return NextResponse.json({ success: true });
}
