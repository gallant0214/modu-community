import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

// POST /api/trade/[tradeId]/bookmark — 북마크 토글
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tradeId: string }> }
) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { tradeId } = await params;
  const id = Number(tradeId);

  const { data: existing } = await supabase
    .from("trade_post_bookmarks")
    .select("id")
    .eq("trade_post_id", id)
    .eq("firebase_uid", user.uid)
    .maybeSingle();

  let unbookmarked = false;
  if (existing) {
    await supabase
      .from("trade_post_bookmarks")
      .delete()
      .eq("trade_post_id", id)
      .eq("firebase_uid", user.uid);
    unbookmarked = true;
  } else {
    await supabase
      .from("trade_post_bookmarks")
      .insert({ trade_post_id: id, firebase_uid: user.uid });
  }

  const { count } = await supabase
    .from("trade_post_bookmarks")
    .select("*", { count: "exact", head: true })
    .eq("trade_post_id", id);

  // 카운터도 갱신
  await supabase
    .from("trade_posts")
    .update({ bookmark_count: count ?? 0 })
    .eq("id", id);

  return NextResponse.json({ unbookmarked, bookmark_count: count ?? 0 });
}

// GET /api/trade/[tradeId]/bookmark — 북마크 상태 조회
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tradeId: string }> }
) {
  const user = await verifyAuth(request).catch(() => null);
  const { tradeId } = await params;
  const id = Number(tradeId);

  const { count } = await supabase
    .from("trade_post_bookmarks")
    .select("*", { count: "exact", head: true })
    .eq("trade_post_id", id);

  let bookmarked = false;
  if (user) {
    const { data } = await supabase
      .from("trade_post_bookmarks")
      .select("id")
      .eq("trade_post_id", id)
      .eq("firebase_uid", user.uid)
      .maybeSingle();
    bookmarked = !!data;
  }

  return NextResponse.json({ bookmark_count: count ?? 0, bookmarked });
}
