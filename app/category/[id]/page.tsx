export const revalidate = 30;

import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/app/lib/db";
import { PostCardItem } from "@/app/components/post-card-item";
import { CategoryTabs } from "@/app/components/category-tabs";
import { SearchBar } from "@/app/components/search-bar";
import type { Post } from "@/app/lib/types";


interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sort?: string; page?: string; searchType?: string; q?: string }>;
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { sort, page, searchType, q } = await searchParams;
  const categoryId = Number(id);

  const categories = await sql`SELECT * FROM categories WHERE id = ${categoryId}`;
  if (categories.length === 0) notFound();
  const category = categories[0];

  const sortMode = sort || "latest";
  const currentPage = Math.max(1, Number(page) || 1);
  const perPage = 10;
  const offset = (currentPage - 1) * perPage;
  const searchQuery = q?.trim() || "";
  const searchFilter = searchType || "all";
  const isSearching = searchQuery.length > 0;
  const likeQuery = `%${searchQuery}%`;

  // 공지 게시글 (모든 종목에서 항상 최상단, 1개만)
  const noticePosts = (await sql`SELECT * FROM posts WHERE is_notice = true ORDER BY created_at DESC LIMIT 1`) as Post[];

  let posts: Post[];
  let totalCount: number;

  if (isSearching) {
    // 검색 모드
    let searchCondition = "";
    if (searchFilter === "title") searchCondition = "AND title ILIKE $2";
    else if (searchFilter === "content") searchCondition = "AND content ILIKE $2";
    else if (searchFilter === "author") searchCondition = "AND author ILIKE $2";
    else if (searchFilter === "region") searchCondition = "AND region ILIKE $2";
    else searchCondition = "AND (title ILIKE $2 OR content ILIKE $2 OR author ILIKE $2 OR region ILIKE $2)";

    if (searchFilter === "title") {
      const countResult = await sql`SELECT COUNT(*) as count FROM posts WHERE category_id = ${categoryId} AND (is_notice = false OR is_notice IS NULL) AND title ILIKE ${likeQuery}`;
      totalCount = Number(countResult[0].count);
      posts = (await sql`SELECT * FROM posts WHERE category_id = ${categoryId} AND (is_notice = false OR is_notice IS NULL) AND title ILIKE ${likeQuery} ORDER BY created_at DESC LIMIT ${perPage} OFFSET ${offset}`) as Post[];
    } else if (searchFilter === "content") {
      const countResult = await sql`SELECT COUNT(*) as count FROM posts WHERE category_id = ${categoryId} AND (is_notice = false OR is_notice IS NULL) AND content ILIKE ${likeQuery}`;
      totalCount = Number(countResult[0].count);
      posts = (await sql`SELECT * FROM posts WHERE category_id = ${categoryId} AND (is_notice = false OR is_notice IS NULL) AND content ILIKE ${likeQuery} ORDER BY created_at DESC LIMIT ${perPage} OFFSET ${offset}`) as Post[];
    } else if (searchFilter === "author") {
      const countResult = await sql`SELECT COUNT(*) as count FROM posts WHERE category_id = ${categoryId} AND (is_notice = false OR is_notice IS NULL) AND author ILIKE ${likeQuery}`;
      totalCount = Number(countResult[0].count);
      posts = (await sql`SELECT * FROM posts WHERE category_id = ${categoryId} AND (is_notice = false OR is_notice IS NULL) AND author ILIKE ${likeQuery} ORDER BY created_at DESC LIMIT ${perPage} OFFSET ${offset}`) as Post[];
    } else if (searchFilter === "region") {
      const countResult = await sql`SELECT COUNT(*) as count FROM posts WHERE category_id = ${categoryId} AND (is_notice = false OR is_notice IS NULL) AND region ILIKE ${likeQuery}`;
      totalCount = Number(countResult[0].count);
      posts = (await sql`SELECT * FROM posts WHERE category_id = ${categoryId} AND (is_notice = false OR is_notice IS NULL) AND region ILIKE ${likeQuery} ORDER BY created_at DESC LIMIT ${perPage} OFFSET ${offset}`) as Post[];
    } else {
      const countResult = await sql`SELECT COUNT(*) as count FROM posts WHERE category_id = ${categoryId} AND (is_notice = false OR is_notice IS NULL) AND (title ILIKE ${likeQuery} OR content ILIKE ${likeQuery} OR author ILIKE ${likeQuery} OR region ILIKE ${likeQuery})`;
      totalCount = Number(countResult[0].count);
      posts = (await sql`SELECT * FROM posts WHERE category_id = ${categoryId} AND (is_notice = false OR is_notice IS NULL) AND (title ILIKE ${likeQuery} OR content ILIKE ${likeQuery} OR author ILIKE ${likeQuery} OR region ILIKE ${likeQuery}) ORDER BY created_at DESC LIMIT ${perPage} OFFSET ${offset}`) as Post[];
    }
  } else {
    // 일반 모드
    const countResult = await sql`SELECT COUNT(*) as count FROM posts WHERE category_id = ${categoryId} AND (is_notice = false OR is_notice IS NULL)`;
    totalCount = Number(countResult[0].count);

    if (sortMode === "popular") {
      posts = (await sql`SELECT * FROM posts WHERE category_id = ${categoryId} AND (is_notice = false OR is_notice IS NULL) ORDER BY views DESC, created_at DESC LIMIT ${perPage} OFFSET ${offset}`) as Post[];
    } else if (sortMode === "helpful") {
      posts = (await sql`SELECT * FROM posts WHERE category_id = ${categoryId} AND (is_notice = false OR is_notice IS NULL) ORDER BY likes DESC, created_at DESC LIMIT ${perPage} OFFSET ${offset}`) as Post[];
    } else {
      posts = (await sql`SELECT * FROM posts WHERE category_id = ${categoryId} AND (is_notice = false OR is_notice IS NULL) ORDER BY created_at DESC LIMIT ${perPage} OFFSET ${offset}`) as Post[];
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));

  // Top posts this month (by likes)
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const topPosts = (await sql`
    SELECT * FROM posts
    WHERE category_id = ${categoryId} AND created_at >= ${monthStart} AND likes > 0
    ORDER BY likes DESC
    LIMIT 3
  `) as Post[];


  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-lg md:max-w-3xl lg:max-w-5xl">
        {/* Header */}
        <header className="relative flex items-center justify-between bg-white px-4 py-3 md:px-6 md:py-4 dark:bg-zinc-900">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              {category.name}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <SearchBar categoryId={categoryId} sortMode={sortMode} />
            <Link
              href={`/category/${categoryId}/write`}
              className="rounded-full bg-violet-500 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-600"
            >
              글쓰기
            </Link>
          </div>
        </header>

        {/* Tabs */}
        <CategoryTabs categoryId={categoryId} current={sortMode} />

        {/* 공지 (항상 최상단, 1개, 제목만) */}
        {noticePosts.length > 0 && (
          <section className="bg-white dark:bg-zinc-900">
            <Link
              href={`/category/${noticePosts[0].category_id}/post/${noticePosts[0].id}`}
              className="flex items-center gap-2 px-4 py-3 md:px-6"
            >
              <span className="shrink-0 rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-bold text-white">
                공지
              </span>
              <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {noticePosts[0].title}
              </span>
            </Link>
          </section>
        )}

        {/* Divider after notice */}
        {noticePosts.length > 0 && (
          <div className="h-2 bg-zinc-100 dark:bg-zinc-800" />
        )}

        {/* 검색 결과 헤더 */}
        {isSearching && (
          <div className="flex items-center justify-between bg-white px-4 py-3 md:px-6 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              &quot;{searchQuery}&quot; 검색 결과 <span className="font-semibold text-violet-500">{totalCount}</span>건
            </p>
            <Link
              href={`/category/${categoryId}?sort=${sortMode}`}
              className="text-xs font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              검색 초기화
            </Link>
          </div>
        )}

        {/* Top posts */}
        {topPosts.length > 0 && sortMode === "latest" && !isSearching && (
          <section className="bg-white px-4 pb-2 pt-5 md:px-6 dark:bg-zinc-900">
            <h2 className="mb-3 flex items-center gap-1.5 text-[15px] font-bold text-zinc-900 dark:text-zinc-100">
              <span>🔥</span> 이번 달 인기 게시글
            </h2>
            <div className="hidden border-b border-zinc-200 px-6 py-2 md:flex dark:border-zinc-700">
              <span className="min-w-0 flex-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400">제목</span>
              <span className="w-20 shrink-0 text-center text-xs font-semibold text-zinc-500 dark:text-zinc-400">글쓴이</span>
              <span className="w-20 shrink-0 text-center text-xs font-semibold text-zinc-500 dark:text-zinc-400">날짜</span>
              <span className="w-14 shrink-0 text-center text-xs font-semibold text-zinc-500 dark:text-zinc-400">조회</span>
              <span className="w-[76px] shrink-0"></span>
            </div>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {topPosts.map((post) => (
                <PostCardItem key={`top-${post.id}`} post={post} />
              ))}
            </div>
          </section>
        )}

        {/* Divider */}
        {topPosts.length > 0 && sortMode === "latest" && !isSearching && (
          <div className="h-2 bg-zinc-100 dark:bg-zinc-800" />
        )}

        {/* All posts */}
        <section className="bg-white dark:bg-zinc-900">
          {/* Table header (desktop) */}
          <div className="hidden border-b border-zinc-200 px-6 py-2 md:flex dark:border-zinc-700">
            <span className="min-w-0 flex-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400">제목</span>
            <span className="w-20 shrink-0 text-center text-xs font-semibold text-zinc-500 dark:text-zinc-400">글쓴이</span>
            <span className="w-20 shrink-0 text-center text-xs font-semibold text-zinc-500 dark:text-zinc-400">날짜</span>
            <span className="w-14 shrink-0 text-center text-xs font-semibold text-zinc-500 dark:text-zinc-400">조회</span>
            <span className="w-[76px] shrink-0"></span>
          </div>

          {posts.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-zinc-400">
                {isSearching ? "검색 결과가 없습니다." : "아직 글이 없습니다."}
              </p>
              {!isSearching && (
                <p className="mt-1 text-sm text-zinc-400">첫 번째 글을 작성해보세요!</p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {posts.map((post) => (
                <PostCardItem key={post.id} post={post} />
              ))}
            </div>
          )}
        </section>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-1 bg-white px-4 py-4 md:py-6 dark:bg-zinc-900">
            {currentPage > 1 && (
              <Link
                href={`/category/${categoryId}?sort=${sortMode}&page=${currentPage - 1}${isSearching ? `&searchType=${searchFilter}&q=${encodeURIComponent(searchQuery)}` : ""}`}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-sm text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
            )}
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <Link
                key={p}
                href={`/category/${categoryId}?sort=${sortMode}&page=${p}${isSearching ? `&searchType=${searchFilter}&q=${encodeURIComponent(searchQuery)}` : ""}`}
                className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium ${
                  p === currentPage
                    ? "bg-violet-500 text-white"
                    : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
              >
                {p}
              </Link>
            ))}
            {currentPage < totalPages && (
              <Link
                href={`/category/${categoryId}?sort=${sortMode}&page=${currentPage + 1}${isSearching ? `&searchType=${searchFilter}&q=${encodeURIComponent(searchQuery)}` : ""}`}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-sm text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
