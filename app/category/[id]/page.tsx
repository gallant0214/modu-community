export const revalidate = 30;

import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/app/lib/db";
import { PostCardItem } from "@/app/components/post-card-item";
import { CategoryTabs } from "@/app/components/category-tabs";
import { SearchBar } from "@/app/components/search-bar";
import { BackButton } from "@/app/components/back-button";
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

  // 모든 쿼리를 병렬 실행하여 속도 최적화
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // 공통 쿼리: 공지 + 인기글 (항상 필요)
  const noticePromise = sql`SELECT * FROM posts WHERE is_notice = true ORDER BY created_at DESC LIMIT 1`;
  const topPromise = sql`SELECT * FROM posts WHERE category_id = ${categoryId} AND created_at >= ${monthStart} AND likes > 0 ORDER BY likes DESC LIMIT 3`;

  let countPromise: Promise<any>;
  let postsPromise: Promise<any>;

  if (isSearching) {
    if (searchFilter === "title") {
      countPromise = sql`SELECT COUNT(*) as count FROM posts WHERE category_id = ${categoryId} AND (is_notice = false OR is_notice IS NULL) AND title ILIKE ${likeQuery}`;
      postsPromise = sql`SELECT * FROM posts WHERE category_id = ${categoryId} AND (is_notice = false OR is_notice IS NULL) AND title ILIKE ${likeQuery} ORDER BY created_at DESC LIMIT ${perPage} OFFSET ${offset}`;
    } else if (searchFilter === "content") {
      countPromise = sql`SELECT COUNT(*) as count FROM posts WHERE category_id = ${categoryId} AND (is_notice = false OR is_notice IS NULL) AND content ILIKE ${likeQuery}`;
      postsPromise = sql`SELECT * FROM posts WHERE category_id = ${categoryId} AND (is_notice = false OR is_notice IS NULL) AND content ILIKE ${likeQuery} ORDER BY created_at DESC LIMIT ${perPage} OFFSET ${offset}`;
    } else if (searchFilter === "author") {
      countPromise = sql`SELECT COUNT(*) as count FROM posts WHERE category_id = ${categoryId} AND (is_notice = false OR is_notice IS NULL) AND author ILIKE ${likeQuery}`;
      postsPromise = sql`SELECT * FROM posts WHERE category_id = ${categoryId} AND (is_notice = false OR is_notice IS NULL) AND author ILIKE ${likeQuery} ORDER BY created_at DESC LIMIT ${perPage} OFFSET ${offset}`;
    } else if (searchFilter === "region") {
      countPromise = sql`SELECT COUNT(*) as count FROM posts WHERE category_id = ${categoryId} AND (is_notice = false OR is_notice IS NULL) AND region ILIKE ${likeQuery}`;
      postsPromise = sql`SELECT * FROM posts WHERE category_id = ${categoryId} AND (is_notice = false OR is_notice IS NULL) AND region ILIKE ${likeQuery} ORDER BY created_at DESC LIMIT ${perPage} OFFSET ${offset}`;
    } else {
      countPromise = sql`SELECT COUNT(*) as count FROM posts WHERE category_id = ${categoryId} AND (is_notice = false OR is_notice IS NULL) AND (title ILIKE ${likeQuery} OR content ILIKE ${likeQuery} OR author ILIKE ${likeQuery} OR region ILIKE ${likeQuery})`;
      postsPromise = sql`SELECT * FROM posts WHERE category_id = ${categoryId} AND (is_notice = false OR is_notice IS NULL) AND (title ILIKE ${likeQuery} OR content ILIKE ${likeQuery} OR author ILIKE ${likeQuery} OR region ILIKE ${likeQuery}) ORDER BY created_at DESC LIMIT ${perPage} OFFSET ${offset}`;
    }
  } else {
    countPromise = sql`SELECT COUNT(*) as count FROM posts WHERE category_id = ${categoryId} AND (is_notice = false OR is_notice IS NULL)`;
    if (sortMode === "popular") {
      postsPromise = sql`SELECT * FROM posts WHERE category_id = ${categoryId} AND (is_notice = false OR is_notice IS NULL) ORDER BY views DESC, created_at DESC LIMIT ${perPage} OFFSET ${offset}`;
    } else if (sortMode === "helpful") {
      postsPromise = sql`SELECT * FROM posts WHERE category_id = ${categoryId} AND (is_notice = false OR is_notice IS NULL) ORDER BY likes DESC, created_at DESC LIMIT ${perPage} OFFSET ${offset}`;
    } else {
      postsPromise = sql`SELECT * FROM posts WHERE category_id = ${categoryId} AND (is_notice = false OR is_notice IS NULL) ORDER BY created_at DESC LIMIT ${perPage} OFFSET ${offset}`;
    }
  }

  // 4개 쿼리 동시 실행
  const [noticeResult, topResult, countResult, postsResult] = await Promise.all([
    noticePromise, topPromise, countPromise, postsPromise,
  ]);

  const noticePosts = noticeResult as Post[];
  const topPosts = topResult as Post[];
  const totalCount = Number(countResult[0].count);
  const posts = postsResult as Post[];
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));

  const buildPageHref = (p: number) =>
    `/category/${categoryId}?sort=${sortMode}&page=${p}${isSearching ? `&searchType=${searchFilter}&q=${encodeURIComponent(searchQuery)}` : ""}`;

  return (
    <div className="min-h-screen bg-[#F8F4EC] dark:bg-zinc-950">
      <div className="mx-auto max-w-lg md:max-w-3xl lg:max-w-5xl px-4 sm:px-6 py-4 sm:py-6 space-y-4">

        {/* ─── 카테고리 헤더 카드 ─── */}
        <header className="relative bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl overflow-hidden shadow-[0_1px_0_rgba(0,0,0,0.02),0_12px_32px_-24px_rgba(107,93,71,0.25)]">
          {/* 장식 */}
          <div aria-hidden className="absolute -top-20 -right-16 w-56 h-56 rounded-full bg-[#6B7B3A]/[0.06] blur-3xl pointer-events-none" />
          <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#6B7B3A]/30 to-transparent" />

          <div className="relative px-5 sm:px-7 pt-5 pb-5">
            <div className="mb-4">
              <BackButton label="Community Board" href="/community" />
            </div>

            <div className="flex items-end justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                {category.emoji && (
                  <span className="shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#F5F0E5] dark:bg-zinc-800 flex items-center justify-center text-3xl sm:text-4xl">
                    {category.emoji}
                  </span>
                )}
                <div className="min-w-0">
                  <h1 className="text-[22px] sm:text-[26px] font-bold text-[#2A251D] dark:text-zinc-100 tracking-tight truncate">
                    {category.name}
                  </h1>
                  <p className="text-[12px] text-[#8C8270] dark:text-zinc-500 mt-0.5">
                    총 <span className="font-semibold text-[#6B7B3A]">{totalCount.toLocaleString()}</span>개의 후기
                  </p>
                </div>
              </div>

              <div className="relative flex items-center gap-2 shrink-0">
                <SearchBar categoryId={categoryId} sortMode={sortMode} />
                <Link
                  href={`/category/${categoryId}/write`}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#6B7B3A] hover:bg-[#5A6930] px-4 sm:px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)] transition-all hover:-translate-y-0.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
                  </svg>
                  글쓰기
                </Link>
              </div>
            </div>
          </div>
        </header>

        {/* ─── 정렬 탭 ─── */}
        <CategoryTabs categoryId={categoryId} current={sortMode} />

        {/* ─── 공지 (재설계) ─── */}
        {noticePosts.length > 0 && (
          <Link
            href={`/category/${noticePosts[0].category_id}/post/${noticePosts[0].id}`}
            className="group flex items-center gap-3 rounded-2xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 px-4 sm:px-5 py-3.5 hover:bg-[#FBF7EB] dark:hover:bg-zinc-800/60 transition-colors"
          >
            <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#C0392B]/10 text-[#C0392B] text-[10px] font-bold tracking-wider uppercase">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
              </svg>
              공지
            </span>
            <span className="flex-1 truncate text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100 group-hover:text-[#6B7B3A] transition-colors">
              {noticePosts[0].title}
            </span>
            <svg className="shrink-0 w-4 h-4 text-[#A89B80] group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
            </svg>
          </Link>
        )}

        {/* ─── 검색 결과 헤더 ─── */}
        {isSearching && (
          <div className="flex items-center justify-between bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-2xl px-4 sm:px-5 py-3">
            <p className="text-[13px] text-[#6B5D47] dark:text-zinc-400">
              &ldquo;<span className="font-semibold text-[#3A342A]">{searchQuery}</span>&rdquo; 검색 결과 <span className="font-bold text-[#6B7B3A]">{totalCount}</span>건
            </p>
            <Link
              href={`/category/${categoryId}?sort=${sortMode}`}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#8C8270] hover:text-[#3A342A] dark:text-zinc-400 dark:hover:text-zinc-300"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
              검색 초기화
            </Link>
          </div>
        )}

        {/* ─── 이번 달 인기 게시글 ─── */}
        {topPosts.length > 0 && sortMode === "latest" && !isSearching && (
          <section className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 sm:px-6 py-4 border-b border-[#E8E0D0]/70 dark:border-zinc-800 bg-[#FBF7EB]/50 dark:bg-zinc-800/30">
              <span className="w-1 h-4 rounded-full bg-[#6B7B3A]" />
              <h2 className="text-[13px] font-bold tracking-wide text-[#3A342A] dark:text-zinc-200 uppercase">
                이번 달 인기 게시글
              </h2>
              <span className="ml-auto text-[11px] text-[#A89B80]">최근 30일 · 좋아요 기준</span>
            </div>
            <div className="hidden md:flex px-6 py-2.5 border-b border-[#E8E0D0]/60 dark:border-zinc-800 bg-[#FBF7EB]/30">
              <span className="min-w-0 flex-1 text-[11px] font-bold tracking-wide text-[#A89B80] uppercase">제목</span>
              <span className="w-28 shrink-0 text-center text-[11px] font-bold tracking-wide text-[#A89B80] uppercase">글쓴이</span>
              <span className="w-20 shrink-0 text-center text-[11px] font-bold tracking-wide text-[#A89B80] uppercase">날짜</span>
              <span className="w-14 shrink-0 text-center text-[11px] font-bold tracking-wide text-[#A89B80] uppercase">조회</span>
              <span className="w-[84px] shrink-0"></span>
            </div>
            <div className="divide-y divide-[#E8E0D0]/50 dark:divide-zinc-800">
              {topPosts.map((post) => (
                <PostCardItem key={`top-${post.id}`} post={post} />
              ))}
            </div>
          </section>
        )}

        {/* ─── 전체 게시글 ─── */}
        <section className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 sm:px-6 py-4 border-b border-[#E8E0D0]/70 dark:border-zinc-800 bg-[#FBF7EB]/50 dark:bg-zinc-800/30">
            <span className="w-1 h-4 rounded-full bg-[#6B7B3A]" />
            <h2 className="text-[13px] font-bold tracking-wide text-[#3A342A] dark:text-zinc-200 uppercase">
              {isSearching ? "검색 결과" : "전체 게시글"}
            </h2>
          </div>

          {/* Table header (desktop) */}
          <div className="hidden md:flex px-6 py-2.5 border-b border-[#E8E0D0]/60 dark:border-zinc-800 bg-[#FBF7EB]/30">
            <span className="min-w-0 flex-1 text-[11px] font-bold tracking-wide text-[#A89B80] uppercase">제목</span>
            <span className="w-28 shrink-0 text-center text-[11px] font-bold tracking-wide text-[#A89B80] uppercase">글쓴이</span>
            <span className="w-20 shrink-0 text-center text-[11px] font-bold tracking-wide text-[#A89B80] uppercase">날짜</span>
            <span className="w-14 shrink-0 text-center text-[11px] font-bold tracking-wide text-[#A89B80] uppercase">조회</span>
            <span className="w-[84px] shrink-0"></span>
          </div>

          {posts.length === 0 ? (
            <div className="py-20 text-center px-4">
              <div className="inline-flex w-14 h-14 mb-3 rounded-2xl bg-[#F5F0E5] dark:bg-zinc-800 items-center justify-center">
                <svg className="w-7 h-7 text-[#A89B80]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
              </div>
              <p className="text-[14px] font-semibold text-[#3A342A] dark:text-zinc-300">
                {isSearching ? "검색 결과가 없습니다" : "아직 글이 없습니다"}
              </p>
              {!isSearching && (
                <p className="mt-1 text-[12px] text-[#8C8270]">첫 번째 후기를 작성해 보세요</p>
              )}
              {!isSearching && (
                <Link
                  href={`/category/${categoryId}/write`}
                  className="inline-flex items-center gap-1.5 mt-5 rounded-xl bg-[#6B7B3A] hover:bg-[#5A6930] px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)] transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
                  </svg>
                  첫 글 작성하기
                </Link>
              )}
            </div>
          ) : (
            <div className="divide-y divide-[#E8E0D0]/50 dark:divide-zinc-800">
              {posts.map((post) => (
                <PostCardItem key={post.id} post={post} hideCategoryTag={category.name} />
              ))}
            </div>
          )}
        </section>

        {/* ─── Pagination ─── */}
        {totalPages > 1 && (
          <nav className="flex items-center justify-center gap-1.5 pt-2 pb-6">
            {currentPage > 1 && (
              <Link
                href={buildPageHref(currentPage - 1)}
                aria-label="이전 페이지"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
            )}
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
              const isActive = p === currentPage;
              return (
                <Link
                  key={p}
                  href={buildPageHref(p)}
                  className={`flex h-9 min-w-[36px] items-center justify-center rounded-lg px-2 text-[13px] font-semibold transition-colors border ${
                    isActive
                      ? "bg-[#6B7B3A] border-[#6B7B3A] text-white shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)]"
                      : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
                  }`}
                >
                  {p}
                </Link>
              );
            })}
            {currentPage < totalPages && (
              <Link
                href={buildPageHref(currentPage + 1)}
                aria-label="다음 페이지"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            )}
          </nav>
        )}
      </div>
    </div>
  );
}
