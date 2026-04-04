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
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl">
        <header className="px-4 pt-4 pb-2">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            종목후기 게시판
          </h1>
          <p className="text-xs text-zinc-400 mt-1">종목을 선택하여 후기를 확인하세요</p>
        </header>

        <CategorySearch popular={popular} all={all} />
      </div>
    </div>
  );
}
