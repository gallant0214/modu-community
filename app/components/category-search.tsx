"use client";

import { useState } from "react";
import Link from "next/link";
import type { Category } from "@/app/lib/types";

/* ── 초성 검색 ── */
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
  if (name.toLowerCase().includes(query.toLowerCase())) return true;
  for (let i = 0; i <= name.length - query.length; i++) {
    let matched = true;
    for (let j = 0; j < query.length; j++) {
      const qChar = query[j];
      const nChar = name[i + j];
      if (isChosung(qChar)) {
        const nChosung = getChosung(nChar);
        if (nChosung !== qChar) { matched = false; break; }
      } else {
        if (nChar.toLowerCase() !== qChar.toLowerCase()) { matched = false; break; }
      }
    }
    if (matched) return true;
  }
  return false;
}

/* ── 모바일 리스트 행 (기존 유지) ── */
function CategoryRow({ category }: { category: Category }) {
  const count = Number(category.post_count);
  const isEmpty = count === 0;
  return (
    <li className={isEmpty ? "opacity-50" : ""}>
      <Link
        href={`/category/${category.id}`}
        className="flex items-center gap-3 rounded-xl px-2 py-3.5 transition-colors hover:bg-white active:bg-zinc-100 dark:hover:bg-zinc-900 dark:active:bg-zinc-800"
      >
        <span className="text-2xl">{category.emoji}</span>
        <span className="flex-1 text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
          {category.name}
        </span>
        <span className="text-sm text-zinc-400">
          {isEmpty ? "아직 후기가 없어요" : `${count.toLocaleString()}개의 후기`}
        </span>
        <svg className="h-4 w-4 text-zinc-300 dark:text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </li>
  );
}

/* ── 데스크톱 인기 종목 카드 (세로형) ── */
function PopularCard({ category }: { category: Category }) {
  const count = Number(category.post_count);
  return (
    <Link
      href={`/category/${category.id}`}
      className="flex flex-col items-center gap-2 p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl transition-all hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800 hover:-translate-y-0.5 text-center"
    >
      <span className="text-4xl">{category.emoji}</span>
      <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{category.name}</span>
      <span className="text-xs font-medium text-blue-600 dark:text-blue-400">{count.toLocaleString()}개의 후기</span>
    </Link>
  );
}

/* ── 데스크톱 전체 종목 카드 (가로형) ── */
function GridCard({ category }: { category: Category }) {
  const count = Number(category.post_count);
  const isEmpty = count === 0;
  return (
    <Link
      href={`/category/${category.id}`}
      className={`flex items-center gap-3 p-3.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl transition-all hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800 ${
        isEmpty ? "opacity-50 hover:opacity-80" : ""
      }`}
    >
      <span className="text-2xl">{category.emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{category.name}</p>
        <p className={`text-xs ${isEmpty ? "text-zinc-400" : "text-zinc-500 dark:text-zinc-400"}`}>
          {isEmpty ? "아직 후기가 없어요" : `${count.toLocaleString()}개의 후기`}
        </p>
      </div>
    </Link>
  );
}

/* ══════════════════════════════════════════════
   메인 컴포넌트
   ══════════════════════════════════════════════ */
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
  const visibleAll = expanded ? all : all.slice(0, 12);

  return (
    <>
      {/* 검색창 */}
      <div className="px-4 py-4 lg:flex lg:justify-center">
        <div className="flex items-center gap-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 px-4 py-2.5 lg:py-3 lg:w-full lg:max-w-lg">
          <svg className="h-4 w-4 text-zinc-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="종목명 또는 초성으로 검색"
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
        /* ── 검색 결과 ── */
        <section className="px-4 pt-2 pb-8">
          <h2 className="mb-3 text-base font-bold text-zinc-900 dark:text-zinc-100">
            검색 결과 <span className="text-blue-600">{filtered.length}</span>건
          </h2>
          {filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-zinc-400">
              검색 결과가 없습니다
            </p>
          ) : (
            <>
              {/* 모바일: 리스트 */}
              <ul className="lg:hidden">
                {filtered.map((cat) => (
                  <CategoryRow key={cat.id} category={cat} />
                ))}
              </ul>
              {/* 데스크톱: 그리드 */}
              <div className="hidden lg:grid lg:grid-cols-4 gap-3">
                {filtered.map((cat) => (
                  <GridCard key={cat.id} category={cat} />
                ))}
              </div>
            </>
          )}
        </section>
      ) : (
        <>
          {/* ── 인기 종목 ── */}
          {popular.length > 0 && (
            <section className="px-4 pt-2 pb-4">
              <h2 className="mb-3 text-base font-bold text-zinc-900 dark:text-zinc-100">
                활발한 종목
              </h2>
              {/* 모바일: 리스트 */}
              <ul className="lg:hidden">
                {popular.map((cat) => (
                  <CategoryRow key={cat.id} category={cat} />
                ))}
              </ul>
              {/* 데스크톱: 5열 카드 */}
              <div className="hidden lg:grid lg:grid-cols-5 gap-3">
                {popular.map((cat) => (
                  <PopularCard key={cat.id} category={cat} />
                ))}
              </div>
            </section>
          )}

          <hr className="mx-4 border-zinc-200 dark:border-zinc-800" />

          {/* ── 전체 종목 ── */}
          <section className="px-4 pt-4 pb-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                전체 종목
              </h2>
              <span className="text-xs text-zinc-400">게시글 많은 순</span>
            </div>
            {/* 모바일: 리스트 */}
            <ul className="lg:hidden">
              {visibleAll.map((cat) => (
                <CategoryRow key={cat.id} category={cat} />
              ))}
            </ul>
            {/* 데스크톱: 4열 그리드 */}
            <div className="hidden lg:grid lg:grid-cols-4 gap-3">
              {visibleAll.map((cat) => (
                <GridCard key={cat.id} category={cat} />
              ))}
            </div>

            {all.length > 12 && !expanded && (
              <button
                onClick={() => setExpanded(true)}
                className="mt-3 flex w-full items-center justify-center gap-1 rounded-xl py-2.5 text-sm font-medium text-zinc-500 hover:bg-white dark:text-zinc-400 dark:hover:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 transition-colors"
              >
                더 많은 종목 보기 ({all.length - 12}개)
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
            {expanded && (
              <button
                onClick={() => setExpanded(false)}
                className="mt-3 flex w-full items-center justify-center gap-1 rounded-xl py-2.5 text-sm font-medium text-zinc-500 hover:bg-white dark:text-zinc-400 dark:hover:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 transition-colors"
              >
                접기
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </button>
            )}
          </section>

          {/* ── 하단 CTA ── */}
          <div className="mx-4 mb-8 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl p-6 sm:p-8 text-center">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-1">
              시험 후기를 공유해 주세요
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
              나의 경험이 다음 수험생에게 큰 도움이 됩니다
            </p>
            <Link
              href="/community"
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              후기 작성하기
            </Link>
          </div>
        </>
      )}
    </>
  );
}
