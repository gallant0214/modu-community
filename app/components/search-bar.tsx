"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SEARCH_FILTERS = [
  { value: "all", label: "전체" },
  { value: "title", label: "제목" },
  { value: "content", label: "내용" },
  { value: "author", label: "작성자" },
  { value: "region", label: "지역" },
];

export function SearchBar({ categoryId, sortMode }: { categoryId: number; sortMode: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");

  function handleSearch() {
    if (!query.trim()) return;
    router.push(`/category/${categoryId}?sort=${sortMode}&searchType=${filter}&q=${encodeURIComponent(query.trim())}`);
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-40 border-b border-zinc-200 bg-white px-4 py-3 shadow-md dark:border-zinc-700 dark:bg-zinc-900">
          {/* 검색 조건 */}
          <div className="mb-2 flex gap-1.5">
            {SEARCH_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filter === f.value
                    ? "bg-violet-500 text-white"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* 검색 입력 */}
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
              placeholder="검색어를 입력하세요"
              className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-violet-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              autoFocus
            />
            <button
              onClick={handleSearch}
              className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-600"
            >
              검색
            </button>
          </div>
        </div>
      )}
    </>
  );
}
