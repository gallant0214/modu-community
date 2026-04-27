export const dynamic = "force-dynamic";

import { supabase } from "@/app/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

// GET /api/posts/my — 내가 쓴 글 (firebase_uid 기반)
export async function GET(req: NextRequest) {
  const user = await verifyAuth(req);
  if (!user) {
    return NextResponse.json({ posts: [], error: "로그인이 필요합니다" }, { status: 401 });
  }

  const { data: posts, error } = await supabase
    .from("posts")
    .select(
      "id, category_id, title, content, author, region, tags, likes, comments_count, is_notice, views, share_count, created_at, updated_at, categories(name)",
    )
    .eq("firebase_uid", user.uid)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    return NextResponse.json({ posts: [], error: error.message }, { status: 500 });
  }

  const postIds = posts.map((p) => p.id);
  const bookmarkCounts = new Map<number, number>();
  if (postIds.length > 0) {
    const { data: bookmarks } = await supabase
      .from("post_bookmarks")
      .select("post_id")
      .in("post_id", postIds)
      .limit(100000);
    if (bookmarks) {
      for (const b of bookmarks) {
        bookmarkCounts.set(b.post_id, (bookmarkCounts.get(b.post_id) || 0) + 1);
      }
    }
  }

  const result = posts.map(({ categories: cat, ...p }) => ({
    ...p,
    share_count: p.share_count ?? 0,
    category_name: cat?.name ?? null,
    bookmark_count: bookmarkCounts.get(p.id) || 0,
  }));

  return NextResponse.json({ posts: result });
}
