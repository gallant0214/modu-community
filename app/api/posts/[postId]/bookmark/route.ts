import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

// POST /api/posts/[postId]/bookmark — 북마크 토글 (로그인 필수)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { postId } = await params;
  const id = Number(postId);

  const { data: existing } = await supabase
    .from("post_bookmarks")
    .select("id")
    .eq("post_id", id)
    .eq("firebase_uid", user.uid)
    .maybeSingle();

  let unbookmarked = false;
  if (existing) {
    await supabase
      .from("post_bookmarks")
      .delete()
      .eq("post_id", id)
      .eq("firebase_uid", user.uid);
    unbookmarked = true;
  } else {
    await supabase
      .from("post_bookmarks")
      .insert({ post_id: id, firebase_uid: user.uid });
  }

  const { count } = await supabase
    .from("post_bookmarks")
    .select("*", { count: "exact", head: true })
    .eq("post_id", id);

  return NextResponse.json({ unbookmarked, bookmark_count: count ?? 0 });
}

// GET /api/posts/[postId]/bookmark — 북마크 상태 조회
export async function GET(
  request: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const user = await verifyAuth(request);
  const { postId } = await params;
  const id = Number(postId);

  const { count } = await supabase
    .from("post_bookmarks")
    .select("*", { count: "exact", head: true })
    .eq("post_id", id);

  let bookmarked = false;
  if (user) {
    const { data } = await supabase
      .from("post_bookmarks")
      .select("id")
      .eq("post_id", id)
      .eq("firebase_uid", user.uid)
      .maybeSingle();
    bookmarked = !!data;
  }

  return NextResponse.json({ bookmark_count: count ?? 0, bookmarked });
}
