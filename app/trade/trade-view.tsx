"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { TradePageResult, TradePost } from "@/app/lib/trade-query";

type Category = "all" | "equipment" | "center";

interface Props {
  initialData: TradePageResult | null;
  initialCategory: Category;
  initialQuery: string;
}

const CATEGORY_TABS: { v: Category; label: string }[] = [
  { v: "all", label: "전체" },
  { v: "equipment", label: "운동기구 중고" },
  { v: "center", label: "센터 매매" },
];

function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금 전";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

function formatPrice(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  if (n >= 10000) return `${(n / 10000).toFixed(n % 10000 === 0 ? 0 : 1)}억원`;
  return `${n.toLocaleString()}만원`;
}

export function TradeView({ initialData, initialCategory, initialQuery }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [category, setCategory] = useState<Category>(initialCategory);
  const [query, setQuery] = useState(initialQuery || "");
  const [searchInput, setSearchInput] = useState(initialQuery || "");
  const [posts, setPosts] = useState<TradePost[]>(initialData?.posts ?? []);
  const [hasMore, setHasMore] = useState(initialData?.hasMore ?? false);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");

  /* URL 쿼리 동기화 */
  const updateUrl = useCallback(
    (next: { category?: Category; q?: string }) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (next.category !== undefined) {
        if (next.category === "all") sp.delete("category");
        else sp.set("category", next.category);
      }
      if (next.q !== undefined) {
        if (!next.q) sp.delete("q");
        else sp.set("q", next.q);
      }
      router.replace(`/trade${sp.toString() ? `?${sp.toString()}` : ""}`);
    },
    [router, searchParams]
  );

  /* 데이터 재조회 */
  const fetchPage = useCallback(
    async (opts: { category: Category; q: string; page: number; append: boolean }) => {
      setLoading(true);
      setError("");
      try {
        const sp = new URLSearchParams();
        if (opts.category !== "all") sp.set("category", opts.category);
        if (opts.q) sp.set("q", opts.q);
        sp.set("page", String(opts.page));
        const res = await fetch(`/api/trade?${sp.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "불러오기 실패");
        setPosts(prev => (opts.append ? [...prev, ...(data.posts || [])] : data.posts || []));
        setHasMore(!!data.hasMore);
      } catch (e) {
        setError(e instanceof Error ? e.message : "오류가 발생했습니다");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /* 카테고리 변경 */
  const handleCategoryChange = (cat: Category) => {
    setCategory(cat);
    setPage(1);
    updateUrl({ category: cat });
    fetchPage({ category: cat, q: query, page: 1, append: false });
  };

  /* 검색 */
  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    setQuery(searchInput);
    setPage(1);
    updateUrl({ q: searchInput });
    fetchPage({ category, q: searchInput, page: 1, append: false });
  };

  /* 더보기 */
  const handleLoadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchPage({ category, q: query, page: next, append: true });
  };

  /* initialData 가 없을 때 클라이언트 폴백 */
  useEffect(() => {
    if (initialData === null) {
      fetchPage({ category, q: query, page: 1, append: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-[#F8F4EC] dark:bg-zinc-950 pb-28">
      {/* 헤더 */}
      <div className="sticky top-14 z-30 bg-[#F8F4EC]/85 dark:bg-zinc-950/85 backdrop-blur-md border-b border-[#E8E0D0]/70 dark:border-zinc-800">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100 tracking-tight">거래 게시판</span>
            <Link href="/trade/write"
              className="inline-flex items-center gap-1 px-3.5 py-1.5 bg-[#6B7B3A] hover:bg-[#5A6930] text-white text-[12px] font-semibold rounded-full shadow-[0_4px_12px_-4px_rgba(107,123,58,0.5)] transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              글쓰기
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-5 space-y-4">
        {/* 카테고리 탭 */}
        <div className="flex gap-1.5">
          {CATEGORY_TABS.map(tab => (
            <button key={tab.v} onClick={() => handleCategoryChange(tab.v)}
              className={`flex-1 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all ${
                category === tab.v
                  ? "bg-[#6B7B3A] text-white shadow-[0_2px_8px_-2px_rgba(107,123,58,0.4)]"
                  : "bg-[#FBF7EB] dark:bg-zinc-800 text-[#6B5D47] dark:text-zinc-400 border border-[#E8E0D0] dark:border-zinc-700 hover:border-[#6B7B3A]/40"
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* 검색바 */}
        <form onSubmit={handleSearch} className="flex items-center gap-2 px-3.5 py-2.5 border border-[#E8E0D0] dark:border-zinc-700 rounded-xl bg-[#FBF7EB] dark:bg-zinc-800 focus-within:border-[#6B7B3A]/50 focus-within:bg-[#FEFCF7] transition-colors">
          <svg className="w-4 h-4 text-[#A89B80] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" value={searchInput} onChange={e => setSearchInput(e.target.value)}
            placeholder="제품명·센터명·제목 검색"
            className="flex-1 text-[13px] bg-transparent text-[#3A342A] dark:text-zinc-100 placeholder-[#A89B80] focus:outline-none" />
          {searchInput && (
            <button type="button" onClick={() => { setSearchInput(""); setQuery(""); updateUrl({ q: "" }); fetchPage({ category, q: "", page: 1, append: false }); }}
              className="text-[12px] text-[#A89B80] hover:text-[#6B5D47]">×</button>
          )}
          <button type="submit" className="text-[12px] font-semibold text-[#6B7B3A] hover:text-[#5A6930]">검색</button>
        </form>

        {/* 에러 */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl text-[12px] text-red-600 font-medium">{error}</div>
        )}

        {/* 카드 리스트 */}
        {posts.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#F5F0E5] dark:bg-zinc-800 flex items-center justify-center mb-3">
              <svg className="w-7 h-7 text-[#A89B80]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <p className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-200 mb-1">등록된 거래 글이 없어요</p>
            <p className="text-[12px] text-[#8C8270]">첫 거래 글을 등록해 보세요</p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {posts.map(p => (
              <li key={p.id}>
                <Link href={`/trade/${p.id}`}
                  className="block bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-2xl overflow-hidden hover:border-[#6B7B3A]/40 hover:shadow-[0_8px_24px_-12px_rgba(107,93,71,0.25)] transition-all">
                  <div className="flex">
                    {/* 썸네일 */}
                    <div className="w-28 sm:w-32 aspect-square shrink-0 bg-[#F5F0E5] dark:bg-zinc-800 relative">
                      {p.image_urls?.[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image_urls[0]} alt={p.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#A89B80]">
                          <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                      {/* 카테고리 배지 */}
                      <span className={`absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide ${
                        p.category === "center"
                          ? "bg-[#C0392B]/90 text-white"
                          : "bg-[#6B7B3A]/90 text-white"
                      }`}>
                        {p.category === "center" ? "센터매매" : "중고"}
                      </span>
                    </div>

                    {/* 본문 */}
                    <div className="flex-1 min-w-0 p-3 sm:p-4 flex flex-col justify-between">
                      <div className="min-w-0">
                        <h3 className="text-[14px] sm:text-[15px] font-bold text-[#2A251D] dark:text-zinc-100 leading-tight tracking-tight line-clamp-2">
                          {p.title}
                        </h3>
                        {p.category === "equipment" ? (
                          <p className="mt-1 text-[12px] text-[#6B5D47] dark:text-zinc-400 line-clamp-1">
                            {p.product_name}{p.condition_text ? ` · ${p.condition_text}` : ""}
                          </p>
                        ) : (
                          <p className="mt-1 text-[12px] text-[#6B5D47] dark:text-zinc-400 line-clamp-1">
                            {p.center_info && typeof p.center_info === "object" && "store_type" in p.center_info
                              ? String((p.center_info as Record<string, unknown>).store_type)
                              : ""}
                            {p.center_info && typeof p.center_info === "object" && "area_pyeong" in p.center_info
                              ? ` · ${(p.center_info as Record<string, unknown>).area_pyeong}평`
                              : ""}
                          </p>
                        )}
                      </div>

                      <div className="flex items-end justify-between mt-2 gap-2">
                        <div className="min-w-0">
                          {p.category === "equipment" ? (
                            <p className="text-[15px] font-bold text-[#6B7B3A] dark:text-[#A8B87A] tracking-tight">
                              {formatPrice(p.price_manwon ?? null)}
                            </p>
                          ) : (
                            <p className="text-[12px] text-[#6B5D47] dark:text-zinc-400">
                              {p.center_info && typeof p.center_info === "object" && "premium" in p.center_info
                                ? `권리금 ${formatPrice(((p.center_info as Record<string, Record<string, number>>).premium?.amount_manwon) ?? 0)}`
                                : ""}
                            </p>
                          )}
                          <p className="text-[11px] text-[#8C8270] dark:text-zinc-500 truncate mt-0.5">
                            {p.region_sido} {p.region_sigungu}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[10px] text-[#A89B80] dark:text-zinc-500">{formatRelativeTime(p.created_at)}</p>
                          <p className="text-[10px] text-[#A89B80] dark:text-zinc-500 mt-0.5">조회 {p.view_count}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {/* 더 보기 */}
        {hasMore && (
          <button onClick={handleLoadMore} disabled={loading}
            className="w-full py-3 border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 rounded-xl text-[13px] font-semibold text-[#6B5D47] dark:text-zinc-400 hover:border-[#6B7B3A]/40 transition-colors disabled:opacity-50">
            {loading ? "불러오는 중..." : "더 보기"}
          </button>
        )}
      </div>

      {/* 하단 FAB (모바일에서 빠른 글쓰기) */}
      <Link href="/trade/write"
        className="sm:hidden fixed bottom-5 right-5 w-14 h-14 rounded-full bg-[#6B7B3A] hover:bg-[#5A6930] text-white shadow-[0_8px_24px_-8px_rgba(107,123,58,0.7)] flex items-center justify-center z-20"
        style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </Link>
    </div>
  );
}
