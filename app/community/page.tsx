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
    <div className="min-h-screen bg-[#F8F4EC] dark:bg-zinc-950">
      {/* 브랜드 히어로 */}
      <div className="relative bg-gradient-to-b from-[#FBF7EB] via-[#F8F4EC] to-[#F8F4EC] dark:from-zinc-900 dark:to-zinc-950 border-b border-[#E8E0D0]/70 dark:border-zinc-800 overflow-hidden">
        {/* 장식용 배경 */}
        <div aria-hidden className="absolute -top-24 left-1/2 -translate-x-1/2 w-[600px] h-60 rounded-full bg-[#6B7B3A]/[0.05] blur-3xl pointer-events-none" />
        <div aria-hidden className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#6B7B3A]/25 to-transparent" />

        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 pt-12 pb-10 lg:text-center">
          {/* 에디토리얼 라벨 */}
          <div className="inline-flex items-center gap-2 mb-4 lg:justify-center">
            <span className="w-6 h-px bg-[#6B7B3A]" />
            <span className="text-[11px] font-bold tracking-[0.15em] text-[#6B7B3A] uppercase">Community Hub</span>
            <span className="w-6 h-px bg-[#6B7B3A] lg:block hidden" />
          </div>
          <h1 className="text-[28px] sm:text-[34px] lg:text-[38px] font-bold text-[#2A251D] dark:text-zinc-100 leading-tight tracking-tight mb-3">
            운동 종목별 이야기와<br className="lg:hidden" /> 노하우가 모이는 공간
          </h1>
          <p className="text-[14px] sm:text-[15px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed max-w-xl lg:mx-auto">
            종목별 시험 후기, 실전 노하우, 진솔한 질문까지. 같은 길을 걷는 사람들과 경험을 나누는 커뮤니티입니다.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl">
        <CategorySearch popular={popular} all={all} />
      </div>
    </div>
  );
}
