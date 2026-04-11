"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const [mounted, setMounted] = useState(false);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { setMounted(true); }, []);

  // 외부 클릭 감지로 닫기
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  function handleSearch() {
    if (!query.trim()) return;
    router.push(`/category/${categoryId}?sort=${sortMode}&searchType=${filter}&q=${encodeURIComponent(query.trim())}`);
    setOpen(false);
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        aria-label="검색"
        className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-colors ${
          open
            ? "border-[#6B7B3A]/50 bg-[#F5F0E5] text-[#6B7B3A]"
            : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[#6B5D47] dark:text-zinc-400 hover:border-[#6B7B3A]/40 hover:bg-[#F5F0E5]/70"
        }`}
      >
        <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </button>

      {mounted && open && createPortal(
        <div
          ref={panelRef}
          className="fixed left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl lg:max-w-5xl px-4 sm:px-6 animate-slide-down"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 100px)" }}
        >
          <div className="relative bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-2xl shadow-[0_20px_48px_-16px_rgba(107,93,71,0.35)] overflow-hidden">
            <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#6B7B3A]/40 to-transparent" />

            <div className="p-4 sm:p-5">
              {/* 헤더 */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-1 h-4 rounded-full bg-[#6B7B3A]" />
                  <h3 className="text-[13px] font-bold tracking-wide text-[#3A342A] dark:text-zinc-200 uppercase">게시글 검색</h3>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="닫기"
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-[#8C8270] hover:text-[#3A342A] hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* 검색 범위 */}
              <div className="mb-3 flex flex-wrap gap-1.5">
                {SEARCH_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setFilter(f.value)}
                    className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all ${
                      filter === f.value
                        ? "bg-[#6B7B3A] text-white shadow-[0_2px_8px_-2px_rgba(107,123,58,0.4)]"
                        : "bg-[#F5F0E5] dark:bg-zinc-800 text-[#6B5D47] dark:text-zinc-400 hover:bg-[#EFE7D5] dark:hover:bg-zinc-700"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* 검색 입력 + 검색 버튼 */}
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 px-3.5 py-2.5 border border-[#E8E0D0] dark:border-zinc-700 rounded-xl bg-[#FBF7EB] dark:bg-zinc-800 focus-within:border-[#6B7B3A]/50 focus-within:bg-[#FEFCF7] transition-colors">
                  <svg className="h-4 w-4 text-[#A89B80] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
                    placeholder="검색어를 입력하세요"
                    className="flex-1 text-[13px] bg-transparent text-[#3A342A] placeholder:text-[#A89B80] focus:outline-none dark:text-zinc-100"
                    autoFocus
                  />
                  {query && (
                    <button
                      onClick={() => setQuery("")}
                      aria-label="지우기"
                      className="text-[#A89B80] hover:text-[#6B5D47]"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                <button
                  onClick={handleSearch}
                  disabled={!query.trim()}
                  className="rounded-xl bg-[#6B7B3A] hover:bg-[#5A6930] px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  검색
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
