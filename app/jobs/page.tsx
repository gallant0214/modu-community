"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { REGION_GROUPS, type RegionGroup } from "@/app/lib/region-data";
import type { JobPost } from "@/app/lib/types";

/* ── 상수 ── */
const SPORTS = [
  "축구","풋살","농구","배구","배드민턴","테니스","탁구","수영","골프","야구",
  "소프트볼","클라이밍","필라테스","요가","헬스/PT","태권도","유도","검도",
  "복싱","킥복싱","무에타이","주짓수","합기도","씨름","핸드볼","럭비",
  "아이스하키","스케이트","스키/스노보드","사이클","트라이애슬론","육상",
  "체조","승마","댄스스포츠","기타",
];
const EMPLOYMENT_TYPES = ["정규직","계약직","파트타임","프리랜서","인턴","기타"];

/* ── 초성 유틸 ── */
const CHOSUNG = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
function getChosung(str: string): string {
  return [...str].map((ch) => {
    const code = ch.charCodeAt(0) - 0xAC00;
    if (code < 0 || code > 11171) return ch;
    return CHOSUNG[Math.floor(code / 588)];
  }).join("");
}
function matchChosung(text: string, query: string): boolean {
  if (!query) return true;
  const tCs = getChosung(text);
  const qCs = getChosung(query);
  // 초성만으로 이루어진 쿼리인지 확인
  const isChosungOnly = [...query].every((c) => CHOSUNG.includes(c));
  if (isChosungOnly) {
    return tCs.includes(qCs);
  }
  return text.toLowerCase().includes(query.toLowerCase());
}

/* ── 유틸 ── */
function relativeTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}시간 전`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}일 전`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}주 전`;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function getDday(deadline: string): { label: string; urgent: boolean } | null {
  if (!deadline) return null;
  const lower = deadline.trim().toLowerCase();
  if (lower.includes("상시") || lower.includes("채용시") || lower.includes("채용 시")) {
    return { label: "상시모집", urgent: false };
  }
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const diff = Math.ceil((d.getTime() - now.getTime()) / 86400000);
  if (diff < 0) return { label: "마감", urgent: false };
  if (diff === 0) return { label: "오늘 마감", urgent: true };
  if (diff <= 7) return { label: `D-${diff}`, urgent: true };
  return { label: `~${d.getMonth() + 1}/${d.getDate()}`, urgent: false };
}

type RecruitStatus = "open" | "urgent" | "always" | "closed";

function getRecruitStatus(job: JobPost): RecruitStatus {
  if (job.is_closed) return "closed";
  const dl = job.deadline?.trim().toLowerCase() || "";
  if (!dl || dl.includes("상시") || dl.includes("채용시") || dl.includes("채용 시")) return "always";
  const d = new Date(job.deadline);
  if (isNaN(d.getTime())) return "open";
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const diff = Math.ceil((d.getTime() - now.getTime()) / 86400000);
  if (diff <= 7 && diff >= 0) return "urgent";
  return "open";
}

const STATUS_CONFIG: Record<RecruitStatus, { label: string; bg: string; text: string }> = {
  open: { label: "모집중", bg: "bg-emerald-50 dark:bg-emerald-950", text: "text-emerald-600 dark:text-emerald-400" },
  urgent: { label: "마감임박", bg: "bg-amber-50 dark:bg-amber-950", text: "text-amber-600 dark:text-amber-400" },
  always: { label: "상시모집", bg: "bg-blue-50 dark:bg-blue-950", text: "text-blue-600 dark:text-blue-400" },
  closed: { label: "모집종료", bg: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-400 dark:text-zinc-500" },
};

/* ── 공고 카드 컴포넌트 ── */
function JobCard({ job }: { job: JobPost }) {
  const status = getRecruitStatus(job);
  const cfg = STATUS_CONFIG[status];
  const isClosed = status === "closed";
  const dday = getDday(job.deadline);

  return (
    <Link
      href={`/jobs/${job.id}`}
      className={`block border rounded-xl p-4 sm:p-5 transition-all hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800 hover:-translate-y-0.5 ${
        isClosed
          ? "border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 opacity-60"
          : "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
      }`}
    >
      <div className="flex items-center gap-1.5 mb-2.5">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ${cfg.bg} ${cfg.text}`}>
          {cfg.label}
        </span>
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
          {job.sport}
        </span>
        {dday && !isClosed && (
          <span className={`ml-auto text-[11px] font-medium ${dday.urgent ? "text-amber-600 dark:text-amber-400" : "text-zinc-400"}`}>
            {dday.label}
          </span>
        )}
      </div>
      <h3 className={`text-[15px] font-bold leading-snug mb-2 line-clamp-2 ${
        isClosed ? "text-zinc-400 dark:text-zinc-500 line-through" : "text-zinc-900 dark:text-zinc-100"
      }`}>
        {job.title}
      </h3>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2 text-sm">
        <span className={`flex items-center gap-1 font-medium ${isClosed ? "text-zinc-400" : "text-zinc-800 dark:text-zinc-200"}`}>
          <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {job.salary || "급여 협의"}
        </span>
        {job.employment_type && (
          <span className={`flex items-center gap-1 ${isClosed ? "text-zinc-400" : "text-zinc-600 dark:text-zinc-400"}`}>
            <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            {job.employment_type}
          </span>
        )}
      </div>
      {job.region_name && (
        <div className="flex items-center gap-1 mb-2.5 text-sm text-zinc-500 dark:text-zinc-400">
          <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {job.region_name}
        </div>
      )}
      <div className="flex items-center justify-between pt-2.5 border-t border-zinc-100 dark:border-zinc-800">
        <span className="text-xs text-zinc-400 truncate max-w-[60%]">{job.center_name || "등록자"}</span>
        <span className="text-xs text-zinc-400">{relativeTime(job.created_at)}</span>
      </div>
    </Link>
  );
}

/* ── 카드 스켈레톤 ── */
function CardSkeleton() {
  return (
    <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 sm:p-5 animate-pulse">
      <div className="flex gap-1.5 mb-2.5">
        <div className="h-5 w-14 bg-zinc-100 dark:bg-zinc-800 rounded-md" />
        <div className="h-5 w-12 bg-zinc-100 dark:bg-zinc-800 rounded" />
      </div>
      <div className="h-5 w-3/4 bg-zinc-100 dark:bg-zinc-800 rounded mb-2" />
      <div className="flex gap-3 mb-2">
        <div className="h-4 w-24 bg-zinc-100 dark:bg-zinc-800 rounded" />
        <div className="h-4 w-16 bg-zinc-100 dark:bg-zinc-800 rounded" />
      </div>
      <div className="h-4 w-28 bg-zinc-100 dark:bg-zinc-800 rounded mb-2.5" />
      <div className="flex justify-between pt-2.5 border-t border-zinc-100 dark:border-zinc-800">
        <div className="h-3 w-20 bg-zinc-100 dark:bg-zinc-800 rounded" />
        <div className="h-3 w-12 bg-zinc-100 dark:bg-zinc-800 rounded" />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   바텀시트 공통 컴포넌트
   ══════════════════════════════════════════════ */
function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white dark:bg-zinc-900 rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[75vh] flex flex-col">
        {/* 모바일 핸들 */}
        <div className="flex justify-center pt-2 pb-0 sm:hidden">
          <div className="w-10 h-1 bg-zinc-300 dark:bg-zinc-600 rounded-full" />
        </div>
        {/* 헤더 */}
        <div className="flex items-center px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
          <span className="font-semibold text-zinc-900 dark:text-zinc-100 flex-1">{title}</span>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* 콘텐츠 */}
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

/* ── 필터 칩 버튼 ── */
function FilterChip({
  label,
  value,
  displayValue,
  onClick,
  onClear,
  icon,
}: {
  label: string;
  value: string;
  displayValue?: string;
  onClick: () => void;
  onClear: () => void;
  icon?: React.ReactNode;
}) {
  const isActive = !!value;
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm border transition-colors whitespace-nowrap ${
        isActive
          ? "border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400"
          : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
      }`}
    >
      {icon}
      {isActive ? (displayValue || value) : label}
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
      {isActive && (
        <span
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          className="ml-0.5 text-blue-400 hover:text-blue-600"
        >&times;</span>
      )}
    </button>
  );
}

/* ══════════════════════════════════════════════
   지역 바텀시트 (2단계)
   ══════════════════════════════════════════════ */
function RegionBottomSheet({
  open,
  onClose,
  value,
  counts,
  onChange,
  onClear,
}: {
  open: boolean;
  onClose: () => void;
  value: string;
  counts: Record<string, number>;
  onChange: (code: string, name: string) => void;
  onClear: () => void;
}) {
  const [step, setStep] = useState<"group" | "sub">("group");
  const [selectedGroup, setSelectedGroup] = useState<RegionGroup | null>(null);

  useEffect(() => {
    if (open) { setStep("group"); setSelectedGroup(null); }
  }, [open]);

  const getCount = (code: string) => counts[code.toLowerCase()] || 0;
  const getGroupTotal = (group: RegionGroup) =>
    group.subRegions.reduce((sum, sr) => sum + getCount(sr.code), 0);

  return (
    <BottomSheet open={open} onClose={onClose} title={step === "group" ? "지역 선택" : selectedGroup?.name || ""}>
      {step === "group" ? (
        <div className="py-1">
          <button
            onClick={() => { onClear(); onClose(); }}
            className="w-full flex items-center px-4 py-3 text-sm text-blue-600 dark:text-blue-400 font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 border-b border-zinc-50 dark:border-zinc-800/50"
          >전체 지역</button>
          {REGION_GROUPS.map((group) => {
            const total = getGroupTotal(group);
            return (
              <button
                key={group.code}
                onClick={() => { setSelectedGroup(group); setStep("sub"); }}
                className="w-full flex items-center justify-between px-4 py-3 text-sm text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 border-b border-zinc-50 dark:border-zinc-800/50 last:border-0"
              >
                <span className="flex items-center gap-2">
                  {group.name}
                  {total > 0 && (
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">({total})</span>
                  )}
                </span>
                <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="py-1">
          <button
            onClick={() => setStep("group")}
            className="w-full flex items-center gap-1 px-4 py-2.5 text-sm text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 border-b border-zinc-100 dark:border-zinc-800"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            뒤로
          </button>
          {selectedGroup?.subRegions.map((sub) => {
            const cnt = getCount(sub.code);
            return (
              <button
                key={sub.code}
                onClick={() => { onChange(sub.code, sub.name); onClose(); }}
                className={`w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 border-b border-zinc-50 dark:border-zinc-800/50 last:border-0 ${
                  value === sub.code ? "text-blue-600 font-medium" : "text-zinc-800 dark:text-zinc-200"
                }`}
              >
                <span>{sub.name}</span>
                {cnt > 0 && (
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">{cnt}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </BottomSheet>
  );
}

/* ══════════════════════════════════════════════
   종목 바텀시트 (초성 검색)
   ══════════════════════════════════════════════ */
const CHOSUNG_BUTTONS = ["ㄱ","ㄴ","ㄷ","ㄹ","ㅁ","ㅂ","ㅅ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];

function SportBottomSheet({
  open,
  onClose,
  value,
  onChange,
  onClear,
}: {
  open: boolean;
  onClose: () => void;
  value: string;
  onChange: (val: string) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setQuery(""); setTimeout(() => inputRef.current?.focus(), 100); }
  }, [open]);

  const filtered = SPORTS.filter((s) => matchChosung(s, query));

  return (
    <BottomSheet open={open} onClose={onClose} title="종목 선택">
      {/* 검색 입력 */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-800">
          <svg className="w-4 h-4 text-zinc-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="종목명 또는 초성 검색 (ㅍㄹㅌ → 필라테스)"
            className="flex-1 text-sm bg-transparent text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-zinc-400 hover:text-zinc-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* 초성 버튼 */}
      <div className="px-4 pb-2">
        <div className="flex flex-wrap gap-1">
          {CHOSUNG_BUTTONS.map((ch) => (
            <button
              key={ch}
              onClick={() => setQuery(query === ch ? "" : ch)}
              className={`w-8 h-8 flex items-center justify-center rounded-md text-xs font-medium transition-colors ${
                query === ch
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              }`}
            >{ch}</button>
          ))}
        </div>
      </div>

      <div className="border-t border-zinc-100 dark:border-zinc-800" />

      {/* 종목 리스트 */}
      <div className="py-1">
        <button
          onClick={() => { onClear(); onClose(); }}
          className={`w-full text-left px-4 py-3 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 border-b border-zinc-50 dark:border-zinc-800/50 ${
            !value ? "text-blue-600 font-medium" : "text-zinc-500"
          }`}
        >전체 종목</button>
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-zinc-400">
            일치하는 종목이 없습니다
          </div>
        ) : (
          filtered.map((sport) => (
            <button
              key={sport}
              onClick={() => { onChange(sport); onClose(); }}
              className={`w-full text-left px-4 py-3 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 border-b border-zinc-50 dark:border-zinc-800/50 last:border-0 ${
                value === sport ? "text-blue-600 font-medium" : "text-zinc-800 dark:text-zinc-200"
              }`}
            >{sport}</button>
          ))
        )}
      </div>
    </BottomSheet>
  );
}

/* ══════════════════════════════════════════════
   고용형태 바텀시트
   ══════════════════════════════════════════════ */
function EmploymentBottomSheet({
  open,
  onClose,
  value,
  onChange,
  onClear,
}: {
  open: boolean;
  onClose: () => void;
  value: string;
  onChange: (val: string) => void;
  onClear: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="고용형태 선택">
      <div className="py-1">
        <button
          onClick={() => { onClear(); onClose(); }}
          className={`w-full text-left px-4 py-3 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 border-b border-zinc-50 dark:border-zinc-800/50 ${
            !value ? "text-blue-600 font-medium" : "text-zinc-500"
          }`}
        >전체</button>
        {EMPLOYMENT_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => { onChange(type); onClose(); }}
            className={`w-full text-left px-4 py-3 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 border-b border-zinc-50 dark:border-zinc-800/50 last:border-0 ${
              value === type ? "text-blue-600 font-medium" : "text-zinc-800 dark:text-zinc-200"
            }`}
          >{type}</button>
        ))}
      </div>
    </BottomSheet>
  );
}


/* ══════════════════════════════════════════════
   메인 페이지
   ══════════════════════════════════════════════ */
export default function JobsPage() {
  /* 데이터 */
  const [jobs, setJobs] = useState<JobPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  /* 필터 */
  const [regionCode, setRegionCode] = useState("");
  const [regionName, setRegionName] = useState("");
  const [sportFilter, setSportFilter] = useState("");
  const [employmentFilter, setEmploymentFilter] = useState("");
  const [hideClosed, setHideClosed] = useState(false);
  const [sort, setSort] = useState("latest");

  /* 검색 */
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  /* 바텀시트 open 상태 */
  const [regionOpen, setRegionOpen] = useState(false);
  const [sportOpen, setSportOpen] = useState(false);
  const [employmentOpen, setEmploymentOpen] = useState(false);

  /* 지역별 누적 카운트 (마감 포함) */
  const [regionCounts, setRegionCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    fetch("/api/jobs/region-counts")
      .then((res) => res.json())
      .then((data) => {
        const counts: Record<string, number> = {};
        const raw = data?.counts || {};
        for (const [key, val] of Object.entries(raw)) {
          counts[key.toLowerCase()] = val as number;
        }
        setRegionCounts(counts);
      })
      .catch(() => {});
  }, []);

  /* 데이터 로드 */
  const loadJobs = useCallback(async (p = 1) => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(p),
      sort,
      searchType: "all",
      ...(regionCode && { region_code: regionCode }),
      ...(sportFilter && { sport: sportFilter }),
      ...(employmentFilter && { employment_type: employmentFilter }),
      ...(hideClosed && { hide_closed: "true" }),
      ...(searchQuery && { q: searchQuery }),
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
  }, [sort, regionCode, sportFilter, employmentFilter, hideClosed, searchQuery]);

  useEffect(() => {
    loadJobs(1);
  }, [loadJobs]);

  const handleSearch = () => {
    setSearchQuery(searchInput);
    setPage(1);
  };

  const clearAllFilters = () => {
    setRegionCode("");
    setRegionName("");
    setSportFilter("");
    setEmploymentFilter("");
    setHideClosed(false);
    setSearchQuery("");
    setSearchInput("");
  };

  const hasAnyFilter = !!regionCode || !!sportFilter || !!employmentFilter || hideClosed || !!searchQuery;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">

      {/* ─── 브랜드 헤더 ─── */}
      <div className="bg-gradient-to-b from-blue-50 to-zinc-50 dark:from-zinc-900 dark:to-zinc-950 border-b border-zinc-100 dark:border-zinc-800">
        <div className="mx-auto max-w-5xl px-4 pt-8 pb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-1">
            지도사를 위한 일자리
          </h1>
          <p className="text-sm sm:text-base text-zinc-500 dark:text-zinc-400 mb-5">
            종목별, 지역별로 나에게 맞는 채용 공고를 찾아보세요
          </p>

          {/* 통합 검색창 */}
          <div className="flex max-w-lg">
            <div className="flex-1 flex">
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="종목, 센터명, 지역으로 검색"
                className="flex-1 px-4 py-2.5 border border-zinc-200 dark:border-zinc-700 rounded-l-xl text-sm bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={handleSearch}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-r-xl transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 필터 바 ─── */}
      <div className="sticky top-14 z-30 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-800">
        <div className="mx-auto max-w-5xl px-4 py-2.5">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
            {/* 지역 */}
            <FilterChip
              label="지역"
              value={regionCode}
              displayValue={regionName}
              onClick={() => setRegionOpen(true)}
              onClear={() => { setRegionCode(""); setRegionName(""); }}
              icon={
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              }
            />

            {/* 종목 */}
            <FilterChip
              label="종목"
              value={sportFilter}
              onClick={() => setSportOpen(true)}
              onClear={() => setSportFilter("")}
            />

            {/* 고용형태 */}
            <FilterChip
              label="고용형태"
              value={employmentFilter}
              onClick={() => setEmploymentOpen(true)}
              onClear={() => setEmploymentFilter("")}
            />

            {/* 모집중만 토글 */}
            <button
              onClick={() => setHideClosed(!hideClosed)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm border transition-colors whitespace-nowrap ${
                hideClosed
                  ? "border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400"
                  : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              }`}
            >
              모집중만
            </button>

            {/* 필터 초기화 */}
            {hasAnyFilter && (
              <button
                onClick={clearAllFilters}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 whitespace-nowrap"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                초기화
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ─── 바텀시트들 ─── */}
      <RegionBottomSheet
        open={regionOpen}
        onClose={() => setRegionOpen(false)}
        value={regionCode}
        counts={regionCounts}
        onChange={(code, name) => { setRegionCode(code); setRegionName(name); }}
        onClear={() => { setRegionCode(""); setRegionName(""); }}
      />
      <SportBottomSheet
        open={sportOpen}
        onClose={() => setSportOpen(false)}
        value={sportFilter}
        onChange={setSportFilter}
        onClear={() => setSportFilter("")}
      />
      <EmploymentBottomSheet
        open={employmentOpen}
        onClose={() => setEmploymentOpen(false)}
        value={employmentFilter}
        onChange={setEmploymentFilter}
        onClear={() => setEmploymentFilter("")}
      />

      {/* ─── 메인 콘텐츠 ─── */}
      <div className="mx-auto max-w-5xl px-4 py-4">

        {/* 정렬 + 결과 요약 */}
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-zinc-500 dark:text-zinc-400">
            {searchQuery ? (
              <span>&ldquo;{searchQuery}&rdquo; 검색 결과 &middot; <strong className="text-zinc-700 dark:text-zinc-300">{total}건</strong></span>
            ) : (
              <span>총 <strong className="text-zinc-700 dark:text-zinc-300">{total}건</strong>의 공고</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 focus:outline-none"
            >
              <option value="latest">최신 등록순</option>
              <option value="popular">많이 본 순</option>
              <option value="likes">추천 많은 순</option>
            </select>
            <Link
              href="/jobs/write"
              className="hidden sm:flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              공고 등록
            </Link>
          </div>
        </div>

        {/* ─── 카드 그리드 ─── */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 mb-4 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
              <svg className="w-8 h-8 text-zinc-300 dark:text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            {searchQuery ? (
              <>
                <p className="text-base font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  &ldquo;{searchQuery}&rdquo;에 대한 검색 결과가 없습니다
                </p>
                <p className="text-sm text-zinc-400 mb-4">다른 검색어로 다시 시도하거나, 필터 조건을 줄여 보세요</p>
                <button
                  onClick={clearAllFilters}
                  className="px-4 py-2 text-sm text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
                >전체 공고 보기</button>
              </>
            ) : hasAnyFilter ? (
              <>
                <p className="text-base font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  현재 조건에 맞는 공고가 없습니다
                </p>
                <p className="text-sm text-zinc-400 mb-4">필터 조건을 변경하거나 전체 공고를 확인해 보세요</p>
                <button
                  onClick={clearAllFilters}
                  className="px-4 py-2 text-sm text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
                >필터 초기화</button>
              </>
            ) : (
              <>
                <p className="text-base font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  아직 등록된 공고가 없습니다
                </p>
                <p className="text-sm text-zinc-400 mb-4">첫 번째 공고를 등록해 보세요</p>
                <Link
                  href="/jobs/write"
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                >공고 등록하기</Link>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {jobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>

            {total <= 5 && total > 0 && (
              <p className="text-center text-sm text-zinc-400 mt-6">새로운 공고가 매일 올라오고 있어요</p>
            )}

            {totalPages > 1 && (
              <div className="flex justify-center gap-1 py-8">
                <button
                  onClick={() => loadJobs(page - 1)}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-sm rounded-md border border-zinc-200 dark:border-zinc-700 disabled:opacity-40 hover:bg-white dark:hover:bg-zinc-800 transition-colors"
                >이전</button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                  return (
                    <button key={p} onClick={() => loadJobs(p)}
                      className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                        p === page
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "border-zinc-200 dark:border-zinc-700 hover:bg-white dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                      }`}
                    >{p}</button>
                  );
                })}
                <button
                  onClick={() => loadJobs(page + 1)}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 text-sm rounded-md border border-zinc-200 dark:border-zinc-700 disabled:opacity-40 hover:bg-white dark:hover:bg-zinc-800 transition-colors"
                >다음</button>
              </div>
            )}
          </>
        )}

        {/* ─── 하단 CTA ─── */}
        <div className="mt-8 mb-12 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl p-6 sm:p-8 text-center">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-1">
            우리 센터도 지도사를 찾고 있나요?
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            모두의 지도사 커뮤니티에서 공고를 등록해 보세요
          </p>
          <Link
            href="/jobs/write"
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            공고 등록하기
          </Link>
        </div>
      </div>

      {/* ─── 모바일 FAB ─── */}
      <Link
        href="/jobs/write"
        className="sm:hidden fixed right-4 bottom-6 z-40 flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-2xl shadow-lg shadow-blue-600/25 transition-all active:scale-95"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        <span className="text-sm">글쓰기</span>
      </Link>
    </div>
  );
}
