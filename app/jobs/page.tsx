"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { REGION_GROUPS, type RegionGroup } from "@/app/lib/region-data";
import type { JobPost } from "@/app/lib/types";
import { useAuth } from "@/app/components/auth-provider";

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "오늘";
  if (diffDays === 1) return "어제";
  if (diffDays <= 7) return `${diffDays}일 전`;
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

export default function JobsPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [jobs, setJobs] = useState<JobPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [selectedRegionCode, setSelectedRegionCode] = useState("");
  const [selectedRegionName, setSelectedRegionName] = useState("전체 지역");
  const [showRegionModal, setShowRegionModal] = useState(false);
  const [regionStep, setRegionStep] = useState<"group" | "sub">("group");
  const [selectedGroup, setSelectedGroup] = useState<RegionGroup | null>(null);

  const [searchType, setSearchType] = useState("title");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sort, setSort] = useState("latest");

  const loadJobs = useCallback(async (p = 1) => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(p),
      sort,
      ...(selectedRegionCode && { region_code: selectedRegionCode }),
      ...(searchQuery && { q: searchQuery, searchType }),
    });
    try {
      const res = await fetch(`/api/jobs?${params}`);
      const data = await res.json();
      setJobs(data.posts || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
      setPage(p);
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [sort, selectedRegionCode, searchQuery, searchType]);

  useEffect(() => {
    loadJobs(1);
  }, [loadJobs]);

  const handleSearch = () => {
    setSearchQuery(searchInput);
  };

  const handleRegionSelect = (code: string, name: string) => {
    setSelectedRegionCode(code);
    setSelectedRegionName(name);
    setShowRegionModal(false);
    setPage(1);
  };

  const handleClearRegion = () => {
    setSelectedRegionCode("");
    setSelectedRegionName("전체 지역");
  };

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl">

        {/* 헤더 */}
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">구인 게시판</h1>
            <Link
              href="/jobs/write"
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              글쓰기
            </Link>
          </div>

          {/* 검색 바 */}
          <div className="flex gap-2 mb-2">
            <select
              value={searchType}
              onChange={(e) => setSearchType(e.target.value)}
              className="text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-2 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
            >
              <option value="title">제목</option>
              <option value="sport">종목</option>
              <option value="author">센터명</option>
              <option value="content">내용</option>
              <option value="title_content">제목+내용</option>
            </select>
            <div className="flex-1 flex">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="검색어 입력"
                className="flex-1 border border-zinc-200 dark:border-zinc-700 rounded-l-lg px-3 py-2 text-sm bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={handleSearch}
                className="px-3 py-2 bg-zinc-100 dark:bg-zinc-800 border border-l-0 border-zinc-200 dark:border-zinc-700 rounded-r-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            </div>
          </div>

          {/* 지역 + 정렬 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowRegionModal(true); setRegionStep("group"); setSelectedGroup(null); }}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {selectedRegionName}
              {selectedRegionCode && (
                <span
                  onClick={(e) => { e.stopPropagation(); handleClearRegion(); }}
                  className="ml-1 text-zinc-400 hover:text-zinc-600"
                >✕</span>
              )}
            </button>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
            >
              <option value="latest">최신순</option>
              <option value="popular">조회순</option>
              <option value="likes">추천순</option>
            </select>
            <span className="ml-auto text-xs text-zinc-400">{total.toLocaleString()}개</span>
          </div>
        </div>

        <div className="border-t border-zinc-100 dark:border-zinc-800" />

        {/* 목록 */}
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-20 text-zinc-400 text-sm">
            {searchQuery ? "검색 결과가 없습니다." : "아직 구인 글이 없습니다."}
          </div>
        ) : (
          <ul>
            {jobs.map((job) => (
              <li key={job.id} className="border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                <Link href={`/jobs/${job.id}`} className="block px-4 py-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="inline-block px-1.5 py-0.5 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 text-xs rounded font-medium">
                          {job.sport}
                        </span>
                        {job.employment_type && (
                          <span className="inline-block px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-xs rounded">
                            {job.employment_type}
                          </span>
                        )}
                        {job.is_closed && (
                          <span className="inline-block px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-700 text-zinc-400 text-xs rounded">모집종료</span>
                        )}
                      </div>
                      <p className={`text-sm font-medium leading-snug mb-1 ${job.is_closed ? "text-zinc-400 dark:text-zinc-500 line-through" : "text-zinc-900 dark:text-zinc-100"}`}>
                        {job.title}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-zinc-400">
                        <span>{job.center_name}</span>
                        {job.region_name && <><span>·</span><span>{job.region_name}</span></>}
                        {job.salary && <><span>·</span><span className="text-zinc-500 dark:text-zinc-400">{job.salary}</span></>}
                      </div>
                    </div>
                    <span className="text-xs text-zinc-400 shrink-0 mt-0.5">{formatDate(job.created_at)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-1 py-6">
            <button
              onClick={() => loadJobs(page - 1)}
              disabled={page <= 1}
              className="px-3 py-1.5 text-sm rounded-md border border-zinc-200 dark:border-zinc-700 disabled:opacity-40 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >이전</button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
              return (
                <button key={p} onClick={() => loadJobs(p)}
                  className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${p === page ? "bg-blue-600 border-blue-600 text-white" : "border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"}`}
                >{p}</button>
              );
            })}
            <button
              onClick={() => loadJobs(page + 1)}
              disabled={page >= totalPages}
              className="px-3 py-1.5 text-sm rounded-md border border-zinc-200 dark:border-zinc-700 disabled:opacity-40 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >다음</button>
          </div>
        )}
      </div>

      {/* 지역 선택 모달 */}
      {showRegionModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowRegionModal(false)} />
          <div className="relative w-full sm:max-w-md bg-white dark:bg-zinc-900 rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[70vh] flex flex-col">
            {/* 모달 헤더 */}
            <div className="flex items-center gap-2 px-4 py-3.5 border-b border-zinc-100 dark:border-zinc-800">
              {regionStep === "sub" && (
                <button onClick={() => setRegionStep("group")} className="p-1 -ml-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              )}
              <span className="font-semibold text-zinc-900 dark:text-zinc-100 flex-1">
                {regionStep === "group" ? "광역시/도 선택" : selectedGroup?.name}
              </span>
              <button onClick={() => setShowRegionModal(false)} className="text-zinc-400 hover:text-zinc-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 목록 */}
            <div className="overflow-y-auto flex-1 py-1">
              {regionStep === "group" ? (
                REGION_GROUPS.map((group) => (
                  <button
                    key={group.code}
                    onClick={() => { setSelectedGroup(group); setRegionStep("sub"); }}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors border-b border-zinc-50 dark:border-zinc-800/50 last:border-0"
                  >
                    <span>{group.name}</span>
                    <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                ))
              ) : (
                selectedGroup?.subRegions.map((sub) => (
                  <button
                    key={sub.code}
                    onClick={() => handleRegionSelect(sub.code, sub.name)}
                    className="w-full text-left px-4 py-3 text-sm text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors border-b border-zinc-50 dark:border-zinc-800/50 last:border-0"
                  >
                    {sub.name}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
