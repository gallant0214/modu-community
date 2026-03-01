import Link from "next/link";
import { sql } from "@/app/lib/db";
import type { Category } from "@/app/lib/types";
import { CategorySearch } from "@/app/components/category-search";

export default async function Home() {
  const categories = (await sql`
    SELECT c.*, COALESCE(p.cnt, 0) AS post_count
    FROM categories c
    LEFT JOIN (SELECT category_id, COUNT(*) AS cnt FROM posts WHERE is_notice = false OR is_notice IS NULL GROUP BY category_id) p
    ON c.id = p.category_id
    ORDER BY post_count DESC, c.name ASC
  `) as Category[];

  const popular = categories
    .filter((c) => Number(c.post_count) > 0)
    .slice(0, 5);
  const popularIds = new Set(popular.map((c) => c.id));
  const all = categories
    .filter((c) => !popularIds.has(c.id))
    .sort((a, b) => Number(b.post_count) - Number(a.post_count));

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <div className="mx-auto max-w-lg md:max-w-3xl lg:max-w-5xl">
        {/* Header */}
        <header className="flex items-center justify-center border-b border-zinc-200 px-4 py-4 md:py-6 dark:border-zinc-800">
          <h1 className="text-lg font-bold text-zinc-900 md:text-xl dark:text-zinc-100">
            모두의 지도사 게시판
          </h1>
        </header>

        <CategorySearch popular={popular} all={all} />

        {/* 문의하기 */}
        <hr className="border-zinc-200 dark:border-zinc-800" />
        <div className="px-4 md:px-6">
          <Link
            href="/inquiry"
            className="flex w-full items-center justify-between py-1.5 text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <span>문의하기</span>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        {/* 관리자 페이지 */}
        <div className="flex justify-end px-4 md:px-6">
          <Link
            href="/admin"
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-400 hover:border-zinc-300 hover:text-zinc-600 dark:border-zinc-700 dark:text-zinc-500 dark:hover:border-zinc-600 dark:hover:text-zinc-300"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            관리자 페이지
          </Link>
        </div>
      </div>
    </div>
  );
}

