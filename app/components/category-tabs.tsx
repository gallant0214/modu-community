"use client";

import Link from "next/link";

const tabs = [
  { key: "latest", label: "최신" },
  { key: "popular", label: "인기" },
  { key: "helpful", label: "도움많은순" },
];

export function CategoryTabs({ categoryId, current }: { categoryId: number; current: string }) {
  return (
    <div className="flex border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={`/category/${categoryId}${tab.key === "latest" ? "" : `?sort=${tab.key}`}`}
          className={`flex-1 py-3 text-center text-sm font-medium transition-colors ${
            current === tab.key
              ? "border-b-2 border-violet-500 text-violet-600 dark:text-violet-400"
              : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
