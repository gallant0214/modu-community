"use client";

import Link from "next/link";

const tabs = [
  { key: "latest", label: "최신" },
  { key: "popular", label: "인기" },
  { key: "helpful", label: "도움많은순" },
];

export function CategoryTabs({ categoryId, current }: { categoryId: number; current: string }) {
  return (
    <div className="flex gap-1 rounded-2xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 p-1">
      {tabs.map((tab) => {
        const isActive = current === tab.key;
        return (
          <Link
            key={tab.key}
            href={`/category/${categoryId}${tab.key === "latest" ? "" : `?sort=${tab.key}`}`}
            className={`flex-1 rounded-xl py-2 text-center text-[13px] font-semibold transition-all ${
              isActive
                ? "bg-[#6B7B3A] text-white shadow-[0_2px_8px_-2px_rgba(107,123,58,0.4)]"
                : "text-[#8C8270] dark:text-zinc-400 hover:text-[#3A342A] dark:hover:text-zinc-200 hover:bg-[#F5F0E5]/60 dark:hover:bg-zinc-800"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
