"use client";

import { useState } from "react";
import Link from "next/link";
import type { Category } from "@/app/lib/types";

// 한글 초성 검색
const CHOSUNG = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
const CHOSUNG_SET = new Set(CHOSUNG);

function getChosung(char: string): string | null {
  const code = char.charCodeAt(0) - 0xAC00;
  if (code < 0 || code > 11171) return null;
  return CHOSUNG[Math.floor(code / (21 * 28))];
}

function isChosung(char: string): boolean {
  return CHOSUNG_SET.has(char);
}

function matchesSearch(name: string, query: string): boolean {
  // 일반 포함 검색
  if (name.toLowerCase().includes(query.toLowerCase())) return true;

  // 초성 매칭: query의 각 글자를 name에서 연속으로 매칭
  for (let i = 0; i <= name.length - query.length; i++) {
    let matched = true;
    for (let j = 0; j < query.length; j++) {
      const qChar = query[j];
      const nChar = name[i + j];
      if (isChosung(qChar)) {
        // 초성이면 name 글자의 초성과 비교
        const nChosung = getChosung(nChar);
        if (nChosung !== qChar) { matched = false; break; }
      } else {
        // 일반 글자면 그대로 비교
        if (nChar.toLowerCase() !== qChar.toLowerCase()) { matched = false; break; }
      }
    }
    if (matched) return true;
  }
  return false;
}

function CategoryRow({ category }: { category: Category }) {
  return (
    <li>
      <Link
        href={`/category/${category.id}`}
        className="flex items-center gap-3 rounded-xl px-2 py-3.5 transition-colors hover:bg-zinc-50 active:bg-zinc-100 dark:hover:bg-zinc-900 dark:active:bg-zinc-800"
      >
        <span className="text-2xl">{category.emoji}</span>
        <span className="flex-1 text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
          {category.name}
        </span>
        <span className="text-sm text-zinc-400">
          {Number(category.post_count).toLocaleString()}개 글
        </span>
        <svg className="h-4 w-4 text-zinc-300 dark:text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </li>
  );
}

export function CategorySearch({
  popular,
  all,
}: {
  popular: Category[];
  all: Category[];
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const searchTerm = query.trim().toLowerCase();
  const isSearching = searchTerm.length > 0;

  const allCategories = [...popular, ...all];
  const filtered = isSearching
    ? allCategories.filter((c) => matchesSearch(c.name, searchTerm))
    : [];
  const visibleAll = expanded ? all : all.slice(0, 10);

  return (
    <>
      {/* Search */}
      <div className="px-4 py-3 md:px-6 md:py-4">
        <div className="flex items-center gap-2 rounded-xl bg-zinc-100 px-4 py-2.5 md:py-3 dark:bg-zinc-900">
          <svg className="h-4 w-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="종목 검색"
            className="flex-1 bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-100"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {isSearching ? (
        /* Search results */
        <section className="px-4 pt-4 pb-8 md:px-6">
          <h2 className="mb-2 text-base font-bold text-zinc-900 dark:text-zinc-100">
            검색 결과 <span className="text-violet-500">{filtered.length}</span>건
          </h2>
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">
              검색 결과가 없습니다.
            </p>
          ) : (
            <ul className="md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-x-2">
              {filtered.map((cat) => (
                <CategoryRow key={cat.id} category={cat} />
              ))}
            </ul>
          )}
        </section>
      ) : (
        <>
          {/* Popular */}
          <section className="px-4 pt-4 pb-2 md:px-6">
            <h2 className="mb-2 flex items-center gap-1.5 text-base font-bold text-zinc-900 dark:text-zinc-100">
              <span>🔥</span> 인기 종목
            </h2>
            <ul className="md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-x-2">
              {popular.map((cat) => (
                <CategoryRow key={cat.id} category={cat} />
              ))}
            </ul>
          </section>

          <hr className="mx-4 border-zinc-200 md:mx-6 dark:border-zinc-800" />

          {/* All */}
          <section className="px-4 pt-4 pb-8 md:px-6">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                전체 종목
              </h2>
              <span className="text-xs text-zinc-400">게시글 순</span>
            </div>
            <ul className="md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-x-2">
              {visibleAll.map((cat) => (
                <CategoryRow key={cat.id} category={cat} />
              ))}
            </ul>
            {all.length > 10 && !expanded && (
              <button
                onClick={() => setExpanded(true)}
                className="mt-1 flex w-full items-center justify-center gap-1 rounded-xl py-2 text-sm font-medium text-zinc-500 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900"
              >
                더보기 ({all.length - 10}개 종목)
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
            {expanded && (
              <button
                onClick={() => setExpanded(false)}
                className="mt-1 flex w-full items-center justify-center gap-1 rounded-xl py-2 text-sm font-medium text-zinc-500 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900"
              >
                접기
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </button>
            )}
          </section>
        </>
      )}
    </>
  );
}
