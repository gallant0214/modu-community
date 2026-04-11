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

/* ── 모바일 리스트 행 ── */
function CategoryRow({ category }: { category: Category }) {
  const count = Number(category.post_count);
  const isEmpty = count === 0;
  return (
    <li>
      <Link
        href={`/category/${category.id}`}
        className={`group flex items-center gap-3.5 rounded-2xl px-3.5 py-3.5 transition-all ${
          isEmpty
            ? "hover:bg-[#F5F0E5]/60 dark:hover:bg-zinc-900"
            : "hover:bg-[#FEFCF7] dark:hover:bg-zinc-900 hover:shadow-[0_4px_14px_-8px_rgba(107,93,71,0.2)]"
        }`}
      >
        <span className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-2xl ${
          isEmpty
            ? "bg-[#F5F0E5]/70 dark:bg-zinc-800/60"
            : "bg-[#F5F0E5] dark:bg-zinc-800 group-hover:bg-[#EFE7D5] transition-colors"
        }`}>
          {category.emoji}
        </span>
        <div className="flex-1 min-w-0">
          <p className={`text-[15px] font-semibold tracking-tight ${
            isEmpty ? "text-[#A89B80] dark:text-zinc-500" : "text-[#2A251D] dark:text-zinc-100"
          }`}>
            {category.name}
          </p>
          <p className={`text-[12px] mt-0.5 ${
            isEmpty ? "text-[#C7B89B] dark:text-zinc-600" : "text-[#8C8270] dark:text-zinc-500"
          }`}>
            {isEmpty ? "첫 후기를 기다리고 있어요" : `후기 ${count.toLocaleString()}개`}
          </p>
        </div>
        <svg className={`h-4 w-4 transition-transform group-hover:translate-x-0.5 ${
          isEmpty ? "text-[#D4C7AA]" : "text-[#A89B80] dark:text-zinc-500"
        }`} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </li>
  );
}

/* ── 데스크톱 인기 종목 카드 (세로형 - 프리미엄) ── */
function PopularCard({ category, rank }: { category: Category; rank: number }) {
  const count = Number(category.post_count);
  return (
    <Link
      href={`/category/${category.id}`}
      className="group relative flex flex-col items-center gap-3 p-6 bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl transition-all hover:-translate-y-1 hover:shadow-[0_12px_32px_-16px_rgba(107,93,71,0.25)] hover:border-[#6B7B3A]/40 text-center overflow-hidden"
    >
      {/* 랭크 표시 */}
      <span className="absolute top-3 left-3 text-[10px] font-bold tracking-[0.1em] text-[#A89B80] dark:text-zinc-500">
        #{rank}
      </span>
      {/* 장식용 배경 원 */}
      <div
        aria-hidden
        className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-[#6B7B3A]/[0.05] pointer-events-none transition-transform duration-500 group-hover:scale-125"
      />

      <div className="relative w-16 h-16 rounded-2xl bg-[#F5F0E5] dark:bg-zinc-800 flex items-center justify-center mt-2 transition-all group-hover:bg-[#EFE7D5] group-hover:-rotate-3">
        <span className="text-4xl">{category.emoji}</span>
      </div>
      <span className="relative text-[15px] font-bold text-[#2A251D] dark:text-zinc-100 tracking-tight">
        {category.name}
      </span>
      <div className="relative inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#EFE7D5] dark:bg-[#6B7B3A]/20">
        <span className="w-1 h-1 rounded-full bg-[#6B7B3A] animate-pulse" />
        <span className="text-[11px] font-semibold text-[#6B7B3A] dark:text-[#A8B87A]">
          후기 {count.toLocaleString()}
        </span>
      </div>
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
      className={`group flex items-center gap-3.5 p-4 border rounded-2xl transition-all ${
        isEmpty
          ? "bg-[#FBF7EB]/60 dark:bg-zinc-900/40 border-[#E8E0D0]/60 dark:border-zinc-800"
          : "bg-[#FEFCF7] dark:bg-zinc-900 border-[#E8E0D0] dark:border-zinc-700 hover:border-[#6B7B3A]/40 hover:shadow-[0_8px_24px_-12px_rgba(107,93,71,0.2)] hover:-translate-y-0.5"
      }`}
    >
      <span className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-2xl ${
        isEmpty
          ? "bg-[#F5F0E5]/60 dark:bg-zinc-800/60"
          : "bg-[#F5F0E5] dark:bg-zinc-800 group-hover:bg-[#EFE7D5] transition-colors"
      }`}>
        {category.emoji}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`text-[14px] font-semibold tracking-tight truncate ${
          isEmpty ? "text-[#A89B80] dark:text-zinc-500" : "text-[#2A251D] dark:text-zinc-100"
        }`}>
          {category.name}
        </p>
        <p className={`text-[12px] mt-0.5 ${
          isEmpty ? "text-[#C7B89B] dark:text-zinc-600" : "text-[#8C8270] dark:text-zinc-500"
        }`}>
          {isEmpty ? "첫 후기를 기다려요" : `후기 ${count.toLocaleString()}개`}
        </p>
      </div>
    </Link>
  );
}

/* ── 섹션 헤더 ── */
function SectionHeader({ kicker, title, note }: { kicker: string; title: string; note?: string }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3">
      <div>
        <div className="inline-flex items-center gap-2 mb-1.5">
          <span className="w-4 h-px bg-[#6B7B3A]" />
          <span className="text-[10px] font-bold tracking-[0.15em] text-[#6B7B3A] uppercase">{kicker}</span>
        </div>
        <h2 className="text-[20px] sm:text-[22px] font-bold text-[#2A251D] dark:text-zinc-100 tracking-tight">
          {title}
        </h2>
      </div>
      {note && (
        <span className="text-[11px] font-medium text-[#A89B80] dark:text-zinc-500 pb-1">{note}</span>
      )}
    </div>
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
      <div className="px-4 sm:px-6 pt-6 pb-4 lg:flex lg:justify-center">
        <div className="relative lg:w-full lg:max-w-xl">
          <div className="flex items-center gap-2 rounded-2xl bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 px-4 py-3 lg:py-3.5 shadow-[0_1px_0_rgba(0,0,0,0.02),0_8px_24px_-16px_rgba(107,93,71,0.25)] focus-within:border-[#6B7B3A]/50 transition-colors">
            <svg className="h-[18px] w-[18px] text-[#A89B80] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="종목명 또는 초성으로 검색 (ㅍㄹㅌ → 필라테스)"
              className="flex-1 bg-transparent text-[14px] text-[#3A342A] placeholder:text-[#A89B80] focus:outline-none dark:text-zinc-100"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="text-[#A89B80] hover:text-[#6B5D47] dark:hover:text-zinc-300"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {isSearching ? (
        /* ── 검색 결과 ── */
        <section className="px-4 sm:px-6 pt-3 pb-10">
          <h2 className="mb-4 text-[16px] font-bold text-[#3A342A] dark:text-zinc-100">
            검색 결과 <span className="text-[#6B7B3A]">{filtered.length}</span>건
          </h2>
          {filtered.length === 0 ? (
            <div className="py-16 text-center bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl">
              <div className="inline-flex w-14 h-14 mb-3 rounded-2xl bg-[#F5F0E5] dark:bg-zinc-800 items-center justify-center">
                <svg className="w-7 h-7 text-[#A89B80]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <p className="text-sm text-[#8C8270] dark:text-zinc-500">검색 결과가 없습니다</p>
            </div>
          ) : (
            <>
              {/* 모바일: 리스트 */}
              <ul className="lg:hidden space-y-1">
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
            <section className="px-4 sm:px-6 pt-3 pb-6">
              <SectionHeader kicker="Popular" title="활발한 종목" note="이번 주 기준" />
              {/* 모바일: 리스트 */}
              <ul className="lg:hidden space-y-1">
                {popular.map((cat) => (
                  <CategoryRow key={cat.id} category={cat} />
                ))}
              </ul>
              {/* 데스크톱: 5열 카드 */}
              <div className="hidden lg:grid lg:grid-cols-5 gap-4">
                {popular.map((cat, idx) => (
                  <PopularCard key={cat.id} category={cat} rank={idx + 1} />
                ))}
              </div>
            </section>
          )}

          {/* 섹션 구분 */}
          <div className="px-4 sm:px-6">
            <div className="h-px bg-gradient-to-r from-transparent via-[#E8E0D0] dark:via-zinc-800 to-transparent" />
          </div>

          {/* ── 전체 종목 ── */}
          <section className="px-4 sm:px-6 pt-6 pb-10">
            <SectionHeader kicker="All Sports" title="전체 종목" note="게시글 많은 순" />

            {/* 모바일: 리스트 */}
            <ul className="lg:hidden space-y-1">
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
                className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-2xl py-3 text-[13px] font-semibold text-[#6B5D47] dark:text-zinc-400 bg-[#FEFCF7] dark:bg-zinc-900 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 border border-[#E8E0D0] dark:border-zinc-700 transition-colors"
              >
                더 많은 종목 보기 ({all.length - 12}개)
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
            {expanded && (
              <button
                onClick={() => setExpanded(false)}
                className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-2xl py-3 text-[13px] font-semibold text-[#6B5D47] dark:text-zinc-400 bg-[#FEFCF7] dark:bg-zinc-900 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 border border-[#E8E0D0] dark:border-zinc-700 transition-colors"
              >
                접기
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                </svg>
              </button>
            )}
          </section>

          {/* ── 하단 CTA ── */}
          <section className="relative px-4 sm:px-6 mb-14">
            <div className="relative bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-8 sm:p-10 text-center shadow-[0_1px_0_rgba(0,0,0,0.02),0_12px_32px_-20px_rgba(107,93,71,0.2)] overflow-hidden">
              <div aria-hidden className="absolute -top-16 -left-16 w-48 h-48 rounded-full bg-[#6B7B3A]/[0.07] blur-3xl pointer-events-none" />
              <div aria-hidden className="absolute -bottom-16 -right-16 w-48 h-48 rounded-full bg-[#6B7B3A]/[0.07] blur-3xl pointer-events-none" />
              <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#6B7B3A]/30 to-transparent" />

              <div className="relative">
                <div className="inline-flex items-center gap-2 mb-4">
                  <span className="w-6 h-px bg-[#6B7B3A]" />
                  <span className="text-[11px] font-bold tracking-[0.15em] text-[#6B7B3A] uppercase">Share Your Story</span>
                  <span className="w-6 h-px bg-[#6B7B3A]" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-[#2A251D] dark:text-zinc-100 mb-2 tracking-tight">
                  시험 후기를 공유해 주세요
                </h2>
                <p className="text-[14px] text-[#6B5D47] dark:text-zinc-400 mb-6 max-w-md mx-auto leading-relaxed">
                  나의 경험이 다음 수험생에게 큰 도움이 됩니다. 위 종목 중 하나를 골라 이야기를 남겨보세요.
                </p>
                <button
                  onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                  className="inline-flex items-center gap-2 px-7 py-3.5 bg-[#6B7B3A] hover:bg-[#5A6930] text-white font-semibold rounded-2xl shadow-[0_8px_24px_-8px_rgba(107,123,58,0.5)] transition-all hover:-translate-y-0.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  종목 선택하러 가기
                </button>
              </div>
            </div>
          </section>
        </>
      )}
    </>
  );
}
