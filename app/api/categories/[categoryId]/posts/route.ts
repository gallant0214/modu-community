import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";
import { cached } from "@/app/lib/cache";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ categoryId: string }> }
) {
  const { categoryId } = await params;
  const catId = Number(categoryId);
  const url = new URL(request.url);

  const sortMode = url.searchParams.get("sort") || "latest";
  const currentPage = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const perPage = 10;
  const offset = (currentPage - 1) * perPage;
  const searchQuery = url.searchParams.get("q")?.trim() || "";
  const searchFilter = url.searchParams.get("searchType") || "all";
  const isSearching = searchQuery.length > 0;
  const likeQuery = `%${searchQuery}%`;

  // 공지 + 이번달 인기글은 메인 쿼리와 병렬 실행을 위해 Promise로 준비
  const noticePostsPromise = cached(`notices`, 300, () =>
    sql`SELECT * FROM posts WHERE is_notice = true ORDER BY created_at DESC LIMIT 1`
  );
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const topPostsPromise = cached(`top:cat:${catId}:${now.getFullYear()}-${now.getMonth()}`, 120, () =>
    sql`
      SELECT * FROM posts
      WHERE category_id = ${catId} AND created_at >= ${monthStart} AND likes > 0
      ORDER BY likes DESC
      LIMIT 3
    `
  );

  let posts;
  let totalCount: number;

  if (isSearching) {
    if (searchFilter === "title") {
      const countResult = await sql`SELECT COUNT(*) as count FROM posts WHERE category_id = ${catId} AND (is_notice = false OR is_notice IS NULL) AND title ILIKE ${likeQuery}`;
      totalCount = Number(countResult[0].count);
      posts = await sql`SELECT * FROM posts WHERE category_id = ${catId} AND (is_notice = false OR is_notice IS NULL) AND title ILIKE ${likeQuery} ORDER BY created_at DESC LIMIT ${perPage} OFFSET ${offset}`;
    } else if (searchFilter === "content") {
      const countResult = await sql`SELECT COUNT(*) as count FROM posts WHERE category_id = ${catId} AND (is_notice = false OR is_notice IS NULL) AND content ILIKE ${likeQuery}`;
      totalCount = Number(countResult[0].count);
      posts = await sql`SELECT * FROM posts WHERE category_id = ${catId} AND (is_notice = false OR is_notice IS NULL) AND content ILIKE ${likeQuery} ORDER BY created_at DESC LIMIT ${perPage} OFFSET ${offset}`;
    } else if (searchFilter === "author") {
      const countResult = await sql`SELECT COUNT(*) as count FROM posts WHERE category_id = ${catId} AND (is_notice = false OR is_notice IS NULL) AND author ILIKE ${likeQuery}`;
      totalCount = Number(countResult[0].count);
      posts = await sql`SELECT * FROM posts WHERE category_id = ${catId} AND (is_notice = false OR is_notice IS NULL) AND author ILIKE ${likeQuery} ORDER BY created_at DESC LIMIT ${perPage} OFFSET ${offset}`;
    } else if (searchFilter === "region") {
      const countResult = await sql`SELECT COUNT(*) as count FROM posts WHERE category_id = ${catId} AND (is_notice = false OR is_notice IS NULL) AND region ILIKE ${likeQuery}`;
      totalCount = Number(countResult[0].count);
      posts = await sql`SELECT * FROM posts WHERE category_id = ${catId} AND (is_notice = false OR is_notice IS NULL) AND region ILIKE ${likeQuery} ORDER BY created_at DESC LIMIT ${perPage} OFFSET ${offset}`;
    } else {
      const countResult = await sql`SELECT COUNT(*) as count FROM posts WHERE category_id = ${catId} AND (is_notice = false OR is_notice IS NULL) AND (title ILIKE ${likeQuery} OR content ILIKE ${likeQuery} OR author ILIKE ${likeQuery} OR region ILIKE ${likeQuery})`;
      totalCount = Number(countResult[0].count);
      posts = await sql`SELECT * FROM posts WHERE category_id = ${catId} AND (is_notice = false OR is_notice IS NULL) AND (title ILIKE ${likeQuery} OR content ILIKE ${likeQuery} OR author ILIKE ${likeQuery} OR region ILIKE ${likeQuery}) ORDER BY created_at DESC LIMIT ${perPage} OFFSET ${offset}`;
    }
  } else {
    // 일반 목록 조회 (60초 캐시)
    const cacheKey = `posts:cat:${catId}:sort:${sortMode}:p:${currentPage}`;
    const result = await cached(cacheKey, 60, async () => {
      const countResult = await sql`SELECT COUNT(*) as count FROM posts WHERE category_id = ${catId} AND (is_notice = false OR is_notice IS NULL)`;
      const tc = Number(countResult[0].count);
      let p;
      if (sortMode === "popular") {
        p = await sql`SELECT * FROM posts WHERE category_id = ${catId} AND (is_notice = false OR is_notice IS NULL) ORDER BY views DESC, created_at DESC LIMIT ${perPage} OFFSET ${offset}`;
      } else if (sortMode === "helpful") {
        p = await sql`SELECT * FROM posts WHERE category_id = ${catId} AND (is_notice = false OR is_notice IS NULL) ORDER BY likes DESC, created_at DESC LIMIT ${perPage} OFFSET ${offset}`;
      } else {
        p = await sql`SELECT * FROM posts WHERE category_id = ${catId} AND (is_notice = false OR is_notice IS NULL) ORDER BY created_at DESC LIMIT ${perPage} OFFSET ${offset}`;
      }
      return { posts: p, totalCount: tc };
    });
    posts = result.posts;
    totalCount = result.totalCount;
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));

  // 공지 + 이번달 인기글 병렬 대기
  const [noticePosts, topPosts] = await Promise.all([noticePostsPromise, topPostsPromise]);

  return NextResponse.json({
    posts,
    totalCount,
    totalPages,
    noticePosts,
    topPosts,
  });
}
