import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

// GET /api/bookmarks?type=posts|jobs — 내 북마크 목록
export async function GET(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "posts";

  if (type === "jobs") {
    const { data, error } = await supabase
      .from("job_post_bookmarks")
      .select("created_at, job_posts(*)")
      .eq("firebase_uid", user.uid)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ bookmarks: [] });
    const bookmarks = (data || [])
      .filter((b) => b.job_posts)
      .map((b) => ({ ...b.job_posts, bookmarked_at: b.created_at }));
    return NextResponse.json({ bookmarks });
  }

  // 게시글 북마크
  const { data, error } = await supabase
    .from("post_bookmarks")
    .select("created_at, posts(*, categories(name))")
    .eq("firebase_uid", user.uid)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ bookmarks: [] });
  const bookmarks = (data || [])
    .filter((b) => b.posts)
    .map((b) => {
      const post = b.posts!;
      const { categories: cat, ...rest } = post;
      return {
        ...rest,
        category_name: cat?.name ?? null,
        bookmarked_at: b.created_at,
      };
    });
  return NextResponse.json({ bookmarks });
}
