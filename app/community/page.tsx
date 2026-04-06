export const revalidate = 60;

import { sql } from "@/app/lib/db";
import type { Category } from "@/app/lib/types";
import { CategorySearch } from "@/app/components/category-search";

export default async function CommunityPage() {
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
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* 브랜드 히어로 */}
      <div className="bg-gradient-to-b from-blue-50 to-zinc-50 dark:from-zinc-900 dark:to-zinc-950 border-b border-zinc-100 dark:border-zinc-800">
        <div className="mx-auto max-w-5xl px-4 pt-8 pb-6 lg:text-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-1">
            합격한 선배의 시험장 이야기
          </h1>
          <p className="text-sm sm:text-base text-zinc-500 dark:text-zinc-400">
            종목별 실기·구술 후기를 한곳에서 확인하세요
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl">
        <CategorySearch popular={popular} all={all} />
      </div>
    </div>
  );
}
