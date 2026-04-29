"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { REGION_GROUPS, type RegionGroup } from "@/app/lib/region-data";
import type { JobPost } from "@/app/lib/types";
import type { JobsPageResult } from "@/app/lib/jobs-query";

interface JobsViewProps {
  initialData: JobsPageResult | null;
}

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

const STATUS_CONFIG: Record<RecruitStatus, { label: string; bg: string; text: string; dot: string }> = {
  open: { label: "모집중", bg: "bg-[#EFE7D5] dark:bg-[#6B7B3A]/20", text: "text-[#6B7B3A] dark:text-[#A8B87A]", dot: "bg-[#6B7B3A]" },
  urgent: { label: "마감임박", bg: "bg-[#F5E4C8] dark:bg-amber-950/40", text: "text-[#B47B2A] dark:text-amber-300", dot: "bg-[#B47B2A]" },
  always: { label: "상시모집", bg: "bg-[#EFE7D5] dark:bg-[#6B7B3A]/15", text: "text-[#6B7B3A] dark:text-[#A8B87A]", dot: "bg-[#6B7B3A]" },
  closed: { label: "모집종료", bg: "bg-[#F5F0E5] dark:bg-zinc-800", text: "text-[#A89B80] dark:text-zinc-500", dot: "bg-[#A89B80]" },
};

/* 급여 문자열 내 숫자 그룹에 천 단위 쉼표 삽입 (4자리 이상만 포맷) */
function formatSalaryDisplay(salary?: string) {
  if (!salary) return "";
  return salary.replace(/\d{4,}/g, (match) => Number(match.replace(/,/g, "")).toLocaleString());
}

/* ── 공고 카드 컴포넌트 ── */
function JobCard({ job }: { job: JobPost }) {
  const status = getRecruitStatus(job);
  const cfg = STATUS_CONFIG[status];
  const isClosed = status === "closed";
  const dday = getDday(job.deadline);
  const pathname = usePathname();
  const sp = useSearchParams();
  const currentUrl = sp.toString() ? `${pathname}?${sp.toString()}` : pathname;

  return (
    <Link
      href={`/jobs/${job.id}?from=${encodeURIComponent(currentUrl)}`}
      className={`group relative block border rounded-2xl p-5 sm:p-6 transition-all duration-200 hover:-translate-y-0.5 ${
        isClosed
          ? "border-[#E8E0D0]/70 dark:border-zinc-800 bg-[#FBF7EB]/60 dark:bg-zinc-900/50 opacity-70"
          : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 hover:border-[#6B7B3A]/40 hover:shadow-[0_8px_24px_-12px_rgba(107,93,71,0.2)]"
      }`}
    >
      {/* 상태 + 스포츠 뱃지 */}
      <div className="flex items-center gap-1.5 mb-3">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}>
          <span className={`w-1 h-1 rounded-full ${cfg.dot} ${status === "open" && !isClosed ? "animate-pulse" : ""}`} />
          {cfg.label}
        </span>
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#F5F0E5] dark:bg-zinc-800 text-[#6B5D47] dark:text-zinc-400 border border-[#E8E0D0]/70 dark:border-zinc-700">
          {job.sport}
        </span>
        {dday && !isClosed && (
          <span className={`ml-auto text-[11px] font-semibold ${dday.urgent ? "text-[#B47B2A] dark:text-amber-300" : "text-[#A89B80] dark:text-zinc-500"}`}>
            {dday.label}
          </span>
        )}
      </div>

      {/* 제목 */}
      <h3 className={`text-[16px] font-bold leading-snug mb-3 line-clamp-2 tracking-tight ${
        isClosed ? "text-[#A89B80] dark:text-zinc-500 line-through" : "text-[#2A251D] dark:text-zinc-100"
      }`}>
        {job.title}
      </h3>

      {/* 급여 하이라이트 */}
      <div className={`inline-flex items-center gap-1.5 mb-3 ${isClosed ? "opacity-50" : ""}`}>
        <svg className={`w-3.5 h-3.5 ${isClosed ? "text-[#A89B80]" : "text-[#6B7B3A]"}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <span className={`text-[14px] font-semibold tracking-tight ${isClosed ? "text-[#A89B80]" : "text-[#3A342A] dark:text-zinc-100"}`}>
          {job.salary ? formatSalaryDisplay(job.salary) : "급여 협의"}
        </span>
        {job.employment_type && (
          <span className="text-[12px] text-[#8C8270] dark:text-zinc-500 ml-1">· {job.employment_type}</span>
        )}
      </div>

      {/* 지역 + 센터 */}
      <div className="flex flex-col gap-1 mb-4">
        {job.region_name && (
          <div className="flex items-center gap-1.5 text-[13px] text-[#6B5D47] dark:text-zinc-400">
            <svg className="w-3.5 h-3.5 text-[#A89B80]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
            <span className="truncate">{job.region_name}</span>
          </div>
        )}
        {job.center_name && (
          <div className="flex items-center gap-1.5 text-[13px] text-[#8C8270] dark:text-zinc-500">
            <svg className="w-3.5 h-3.5 text-[#A89B80]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
            </svg>
            <span className="truncate">{job.center_name}</span>
          </div>
        )}
        {job.deadline && (
          <div className={`flex items-center gap-1.5 text-[13px] ${isClosed ? "text-[#A89B80]" : dday?.urgent ? "text-[#B47B2A] dark:text-amber-300 font-semibold" : "text-[#6B5D47] dark:text-zinc-400"}`}>
            <svg className="w-3.5 h-3.5 text-[#A89B80]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="truncate">모집기간: {job.deadline}</span>
          </div>
        )}
      </div>

      {/* 메타 */}
      <div className="flex items-center justify-between pt-3 border-t border-[#E8E0D0]/70 dark:border-zinc-800">
        <span className="text-[11px] text-[#A89B80] dark:text-zinc-500 font-medium">{relativeTime(job.created_at)}</span>
        <span className="inline-flex items-center gap-1 text-[11px] text-[#A89B80] dark:text-zinc-500 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
          자세히 보기
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
          </svg>
        </span>
      </div>
    </Link>
  );
}

/* ── 카드 스켈레톤 ── */
function CardSkeleton() {
  return (
    <div className="border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 rounded-2xl p-5 sm:p-6 animate-pulse">
      <div className="flex gap-1.5 mb-3">
        <div className="h-5 w-14 bg-[#F5F0E5] dark:bg-zinc-800 rounded-full" />
        <div className="h-5 w-12 bg-[#F5F0E5] dark:bg-zinc-800 rounded" />
      </div>
      <div className="h-5 w-3/4 bg-[#F5F0E5] dark:bg-zinc-800 rounded mb-3" />
      <div className="h-4 w-32 bg-[#F5F0E5] dark:bg-zinc-800 rounded mb-3" />
      <div className="h-3 w-24 bg-[#F5F0E5] dark:bg-zinc-800 rounded mb-2" />
      <div className="h-3 w-28 bg-[#F5F0E5] dark:bg-zinc-800 rounded mb-4" />
      <div className="flex justify-between pt-3 border-t border-[#E8E0D0]/70 dark:border-zinc-800">
        <div className="h-3 w-20 bg-[#F5F0E5] dark:bg-zinc-800 rounded" />
        <div className="h-3 w-12 bg-[#F5F0E5] dark:bg-zinc-800 rounded" />
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
      <div className="absolute inset-0 bg-[#2A251D]/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-[#FEFCF7] dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[75vh] flex flex-col border border-[#E8E0D0] dark:border-zinc-700">
        {/* 모바일 핸들 */}
        <div className="flex justify-center pt-2.5 pb-0 sm:hidden">
          <div className="w-10 h-1 bg-[#E8E0D0] dark:bg-zinc-600 rounded-full" />
        </div>
        {/* 헤더 */}
        <div className="flex items-center px-5 py-4 border-b border-[#E8E0D0]/70 dark:border-zinc-800">
          <span className="font-bold text-[#3A342A] dark:text-zinc-100 flex-1">{title}</span>
          <button onClick={onClose} className="p-1 text-[#8C8270] hover:text-[#3A342A] dark:text-zinc-400 dark:hover:text-zinc-300">
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
      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-medium border transition-all whitespace-nowrap ${
        isActive
          ? "border-[#6B7B3A] bg-[#6B7B3A] text-white shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)]"
          : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[#6B5D47] dark:text-zinc-400 hover:border-[#6B7B3A]/40 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
      }`}
    >
      {icon}
      {isActive ? (displayValue || value) : label}
      <svg className="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
      </svg>
      {isActive && (
        <span
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          className="ml-0.5 -mr-1 w-4 h-4 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white text-[11px] leading-none"
        >×</span>
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
  // 그룹 전체 카운트: 상위 코드 카운트 + 하위 코드 카운트 합산
  const getGroupTotal = (group: RegionGroup) => {
    const parentCount = getCount(group.code);
    const subTotal = group.subRegions.reduce((sum, sr) => sum + getCount(sr.code), 0);
    return parentCount + subTotal;
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={step === "group" ? "지역 선택" : selectedGroup?.name || ""}>
      {step === "group" ? (
        <div className="py-1">
          <button
            onClick={() => { onClear(); onClose(); }}
            className="w-full flex items-center px-5 py-3.5 text-sm text-[#6B7B3A] dark:text-[#A8B87A] font-semibold hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 border-b border-[#E8E0D0]/50 dark:border-zinc-800/50"
          >전체 지역</button>
          {REGION_GROUPS.map((group) => {
            const total = getGroupTotal(group);
            return (
              <button
                key={group.code}
                onClick={() => { setSelectedGroup(group); setStep("sub"); }}
                className="w-full flex items-center justify-between px-5 py-3.5 text-sm text-[#3A342A] dark:text-zinc-200 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 border-b border-[#E8E0D0]/50 dark:border-zinc-800/50 last:border-0"
              >
                <span className="flex items-center gap-2">
                  {group.name}
                  {total > 0 && (
                    <span className="text-xs text-[#A89B80] dark:text-zinc-500">({total})</span>
                  )}
                </span>
                <svg className="w-4 h-4 text-[#A89B80]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            className="w-full flex items-center gap-1 px-5 py-3 text-sm text-[#8C8270] hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 border-b border-[#E8E0D0]/50 dark:border-zinc-800"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            뒤로
          </button>
          {/* 광역시/특별시는 "전체" 선택 가능 */}
          {selectedGroup && /특별시|광역시|특별자치시/.test(selectedGroup.name) && (() => {
            const total = getGroupTotal(selectedGroup);
            return (
              <button
                onClick={() => { onChange(selectedGroup.code, `${selectedGroup.name} 전체`); onClose(); }}
                className={`w-full flex items-center justify-between px-5 py-3.5 text-sm font-semibold hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 border-b border-[#E8E0D0]/50 dark:border-zinc-800/50 ${
                  value === selectedGroup.code ? "text-[#6B7B3A] dark:text-[#A8B87A]" : "text-[#6B7B3A] dark:text-[#A8B87A]"
                }`}
              >
                <span>{selectedGroup.name} 전체</span>
                {total > 0 && <span className="text-xs text-[#A89B80] dark:text-zinc-500">({total})</span>}
              </button>
            );
          })()}
          {selectedGroup?.subRegions.map((sub) => {
            const cnt = getCount(sub.code);
            return (
              <button
                key={sub.code}
                onClick={() => { onChange(sub.code, sub.name); onClose(); }}
                className={`w-full flex items-center justify-between px-5 py-3.5 text-sm hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 border-b border-[#E8E0D0]/50 dark:border-zinc-800/50 last:border-0 ${
                  value === sub.code ? "text-[#6B7B3A] dark:text-[#A8B87A] font-semibold" : "text-[#3A342A] dark:text-zinc-200"
                }`}
              >
                <span>{sub.name}</span>
                {cnt > 0 && (
                  <span className="text-xs text-[#A89B80] dark:text-zinc-500">{cnt}</span>
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
      <div className="px-5 pt-4 pb-2">
        <div className="flex items-center gap-2 px-3.5 py-2.5 border border-[#E8E0D0] dark:border-zinc-700 rounded-xl bg-[#FBF7EB] dark:bg-zinc-800 focus-within:border-[#6B7B3A]/60 focus-within:bg-[#FEFCF7] transition-colors">
          <svg className="w-4 h-4 text-[#A89B80] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="종목명 또는 초성 검색 (ㅍㄹㅌ → 필라테스)"
            className="flex-1 text-sm bg-transparent text-[#3A342A] dark:text-zinc-100 placeholder-[#A89B80] focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-[#A89B80] hover:text-[#6B5D47]">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* 초성 버튼 */}
      <div className="px-5 pb-3">
        <div className="flex flex-wrap gap-1.5">
          {CHOSUNG_BUTTONS.map((ch) => (
            <button
              key={ch}
              onClick={() => setQuery(query === ch ? "" : ch)}
              className={`w-9 h-9 flex items-center justify-center rounded-lg text-xs font-semibold transition-colors ${
                query === ch
                  ? "bg-[#6B7B3A] text-white shadow-[0_2px_8px_-2px_rgba(107,123,58,0.4)]"
                  : "bg-[#F5F0E5] dark:bg-zinc-800 text-[#6B5D47] dark:text-zinc-400 hover:bg-[#EFE7D5] dark:hover:bg-zinc-700"
              }`}
            >{ch}</button>
          ))}
        </div>
      </div>

      <div className="border-t border-[#E8E0D0]/70 dark:border-zinc-800" />

      {/* 종목 리스트 */}
      <div className="py-1">
        <button
          onClick={() => { onClear(); onClose(); }}
          className={`w-full text-left px-5 py-3.5 text-sm hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 border-b border-[#E8E0D0]/50 dark:border-zinc-800/50 ${
            !value ? "text-[#6B7B3A] dark:text-[#A8B87A] font-semibold" : "text-[#8C8270]"
          }`}
        >전체 종목</button>
        {filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-[#A89B80]">
            일치하는 종목이 없습니다
          </div>
        ) : (
          filtered.map((sport) => (
            <button
              key={sport}
              onClick={() => { onChange(sport); onClose(); }}
              className={`w-full text-left px-5 py-3.5 text-sm hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 border-b border-[#E8E0D0]/50 dark:border-zinc-800/50 last:border-0 ${
                value === sport ? "text-[#6B7B3A] dark:text-[#A8B87A] font-semibold" : "text-[#3A342A] dark:text-zinc-200"
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
          className={`w-full text-left px-5 py-3.5 text-sm hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 border-b border-[#E8E0D0]/50 dark:border-zinc-800/50 ${
            !value ? "text-[#6B7B3A] dark:text-[#A8B87A] font-semibold" : "text-[#8C8270]"
          }`}
        >전체</button>
        {EMPLOYMENT_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => { onChange(type); onClose(); }}
            className={`w-full text-left px-5 py-3.5 text-sm hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 border-b border-[#E8E0D0]/50 dark:border-zinc-800/50 last:border-0 ${
              value === type ? "text-[#6B7B3A] dark:text-[#A8B87A] font-semibold" : "text-[#3A342A] dark:text-zinc-200"
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
export function JobsView({ initialData }: JobsViewProps) {
  /* 데이터 — SSR 초기 데이터가 있으면 그걸로 시작, 없으면 빈 상태 */
  const [jobs, setJobs] = useState<JobPost[]>(initialData?.posts || []);
  const [loading, setLoading] = useState(!initialData);
  const [total, setTotal] = useState(initialData?.total || 0);
  const [page, setPage] = useState(initialData?.page || 1);
  const [totalPages, setTotalPages] = useState(initialData?.totalPages || 1);

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

    // URL 동기화 (브라우저 주소창/history 에 반영) — RSC 재페치는 일으키지 않음.
    // router.replace 를 쓰면 Server Component 가 재호출되어 initialData 가 새 ref 로
    // 갱신되고 useEffect 가 무한 재실행됨. window.history 직접 갱신으로 회피.
    //
    // pushState 사용 이유: replaceState 로 하면 페이지 이동(1→2)이 history 에 쌓이지
    // 않아, 글 상세에서 뒤로가기 시 마지막 entry(보통 page=1 진입 시점)로 복원되는
    // 버그 발생. pushState 로 바꿔 history 에 기록하고 popstate 핸들러에서 복원.
    if (typeof window !== "undefined") {
      const newUrl = `/jobs?${params.toString()}`;
      const currentUrl = window.location.pathname + window.location.search;
      if (currentUrl !== newUrl) {
        window.history.pushState({ jobsPage: p }, "", newUrl);
      }
    }

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

  // 첫 마운트 시 initialData 가 있으면 fetch 스킵 (SSR 서버에서 이미 받아온 상태)
  // initialData 는 deps 에 두지 않음 — RSC 재페치 시 새 ref 가 와도 effect 재실행 X.
  // (재실행되면 loadJobs(1) 호출되어 무한 루프 발생)
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      if (initialData) return;
    }
    loadJobs(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadJobs]);

  // 뒤로/앞으로가기(popstate) 시 URL 의 page param 으로 복원.
  // pushState 로 쌓아둔 history entry 들 사이를 사용자가 이동할 때 데이터도 같이 동기화.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPop = () => {
      const sp = new URLSearchParams(window.location.search);
      const p = Math.max(1, Number(sp.get("page")) || 1);
      loadJobs(p);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
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
    <div className="min-h-screen bg-[#F8F4EC] dark:bg-zinc-950">

      {/* ─── 브랜드 헤더 ─── */}
      <div className="relative bg-gradient-to-b from-[#FBF7EB] via-[#F8F4EC] to-[#F8F4EC] dark:from-zinc-900 dark:to-zinc-950 border-b border-[#E8E0D0]/70 dark:border-zinc-800 overflow-hidden">
        {/* 장식용 배경 */}
        <div aria-hidden className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-[#6B7B3A]/[0.05] blur-3xl pointer-events-none" />
        <div aria-hidden className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#6B7B3A]/25 to-transparent" />

        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 pt-10 pb-8">
          {/* 에디토리얼 라벨 */}
          <div className="inline-flex items-center gap-2 mb-4">
            <span className="w-6 h-px bg-[#6B7B3A]" />
            <span className="text-[11px] font-bold tracking-[0.15em] text-[#6B7B3A] uppercase">Sports Jobs</span>
          </div>

          <h1 className="text-[28px] sm:text-[34px] font-bold text-[#2A251D] dark:text-zinc-100 leading-tight tracking-tight mb-2">
            지도사를 위한 일자리
          </h1>
          <p className="text-[14px] sm:text-[15px] text-[#6B5D47] dark:text-zinc-400 mb-7 max-w-xl">
            종목별·지역별로 나에게 맞는 채용 공고를 찾아보세요. 매일 새로운 기회가 업데이트됩니다.
          </p>

          {/* 통합 검색창 */}
          <div className="relative max-w-xl">
            <div className="flex items-center bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-2xl shadow-[0_1px_0_rgba(0,0,0,0.02),0_8px_24px_-16px_rgba(107,93,71,0.25)] focus-within:border-[#6B7B3A]/50 transition-colors">
              <div className="pl-4 pr-2 text-[#A89B80]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="종목, 센터명, 지역으로 검색"
                className="flex-1 py-3.5 text-[14px] bg-transparent text-[#3A342A] dark:text-zinc-100 placeholder-[#A89B80] focus:outline-none"
              />
              <button
                onClick={handleSearch}
                className="mr-1.5 my-1.5 px-5 py-2.5 bg-[#6B7B3A] hover:bg-[#5A6930] text-white text-sm font-semibold rounded-xl shadow-[0_2px_8px_-2px_rgba(107,123,58,0.4)] transition-colors"
              >
                검색
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 필터 바 ─── */}
      <div className="sticky top-14 z-30 bg-[#F8F4EC]/85 dark:bg-zinc-950/85 backdrop-blur-md border-b border-[#E8E0D0]/70 dark:border-zinc-800">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-3">
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
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-medium border transition-all whitespace-nowrap ${
                hideClosed
                  ? "border-[#6B7B3A] bg-[#6B7B3A] text-white shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)]"
                  : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[#6B5D47] dark:text-zinc-400 hover:border-[#6B7B3A]/40 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
              }`}
            >
              {hideClosed && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
              모집중만
            </button>

            {/* 필터 초기화 */}
            {hasAnyFilter && (
              <button
                onClick={clearAllFilters}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs text-[#A89B80] hover:text-[#6B5D47] dark:hover:text-zinc-300 whitespace-nowrap"
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
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6">

        {/* 정렬 + 결과 요약 */}
        <div className="flex items-center justify-between mb-5">
          <div className="text-[13px] text-[#6B5D47] dark:text-zinc-400">
            {searchQuery ? (
              <span>&ldquo;<span className="font-semibold text-[#3A342A]">{searchQuery}</span>&rdquo; 검색 결과 · <strong className="font-bold text-[#6B7B3A]">{total}건</strong></span>
            ) : (
              <span>총 <strong className="font-bold text-[#6B7B3A]">{total}건</strong>의 공고</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="text-[13px] font-medium border border-[#E8E0D0] dark:border-zinc-700 rounded-xl px-3 py-2 bg-[#FEFCF7] dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300 focus:outline-none focus:border-[#6B7B3A]/50 cursor-pointer"
            >
              <option value="latest">최신 등록순</option>
              <option value="popular">많이 본 순</option>
            </select>
            <Link
              href="/jobs/write"
              className="hidden sm:flex items-center gap-1.5 px-4 py-2 bg-[#6B7B3A] hover:bg-[#5A6930] text-white text-[13px] font-semibold rounded-xl shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              공고 등록
            </Link>
          </div>
        </div>

        {/* ─── 카드 그리드 ─── */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl">
            <div className="w-16 h-16 mb-4 rounded-2xl bg-[#F5F0E5] dark:bg-zinc-800 flex items-center justify-center">
              <svg className="w-8 h-8 text-[#A89B80] dark:text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            {searchQuery ? (
              <>
                <p className="text-base font-bold text-[#3A342A] dark:text-zinc-300 mb-1">
                  &ldquo;{searchQuery}&rdquo;에 대한 검색 결과가 없습니다
                </p>
                <p className="text-sm text-[#8C8270] mb-5">다른 검색어로 다시 시도하거나, 필터 조건을 줄여 보세요</p>
                <button
                  onClick={clearAllFilters}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-[#6B7B3A] hover:bg-[#5A6930] rounded-xl shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)] transition-colors"
                >전체 공고 보기</button>
              </>
            ) : hasAnyFilter ? (
              <>
                <p className="text-base font-bold text-[#3A342A] dark:text-zinc-300 mb-1">
                  현재 조건에 맞는 공고가 없습니다
                </p>
                <p className="text-sm text-[#8C8270] mb-5">필터 조건을 변경하거나 전체 공고를 확인해 보세요</p>
                <button
                  onClick={clearAllFilters}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-[#6B7B3A] hover:bg-[#5A6930] rounded-xl shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)] transition-colors"
                >필터 초기화</button>
              </>
            ) : (
              <>
                <p className="text-base font-bold text-[#3A342A] dark:text-zinc-300 mb-1">
                  아직 등록된 공고가 없습니다
                </p>
                <p className="text-sm text-[#8C8270] mb-5">첫 번째 공고를 등록해 보세요</p>
                <Link
                  href="/jobs/write"
                  className="px-5 py-2.5 bg-[#6B7B3A] hover:bg-[#5A6930] text-white text-sm font-semibold rounded-xl shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)] transition-colors"
                >공고 등록하기</Link>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {jobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>

            {total <= 5 && total > 0 && (
              <p className="text-center text-[13px] text-[#A89B80] mt-8">새로운 공고가 매일 올라오고 있어요</p>
            )}

            {totalPages > 1 && (
              <div className="flex justify-center gap-1.5 py-10">
                <button
                  onClick={() => loadJobs(1)}
                  disabled={page <= 1}
                  aria-label="처음 페이지"
                  title="처음 페이지"
                  className="px-3 py-2 text-[13px] font-medium rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[#6B5D47] dark:text-zinc-300 disabled:opacity-40 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 transition-colors"
                >«</button>
                <button
                  onClick={() => loadJobs(page - 1)}
                  disabled={page <= 1}
                  className="px-3.5 py-2 text-[13px] font-medium rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[#6B5D47] dark:text-zinc-300 disabled:opacity-40 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 transition-colors"
                >이전</button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                  return (
                    <button key={p} onClick={() => loadJobs(p)}
                      className={`min-w-[36px] px-2 py-2 text-[13px] font-semibold rounded-lg border transition-colors ${
                        p === page
                          ? "bg-[#6B7B3A] border-[#6B7B3A] text-white shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)]"
                          : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 text-[#6B5D47] dark:text-zinc-300"
                      }`}
                    >{p}</button>
                  );
                })}
                <button
                  onClick={() => loadJobs(page + 1)}
                  disabled={page >= totalPages}
                  className="px-3.5 py-2 text-[13px] font-medium rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[#6B5D47] dark:text-zinc-300 disabled:opacity-40 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 transition-colors"
                >다음</button>
                <button
                  onClick={() => loadJobs(totalPages)}
                  disabled={page >= totalPages}
                  aria-label="끝 페이지"
                  title="끝 페이지"
                  className="px-3 py-2 text-[13px] font-medium rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[#6B5D47] dark:text-zinc-300 disabled:opacity-40 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 transition-colors"
                >»</button>
              </div>
            )}
          </>
        )}

        {/* ─── 하단 CTA ─── */}
        <section className="relative mt-10 mb-14 overflow-hidden">
          <div className="relative bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-8 sm:p-10 text-center shadow-[0_1px_0_rgba(0,0,0,0.02),0_12px_32px_-20px_rgba(107,93,71,0.2)] overflow-hidden">
            <div aria-hidden className="absolute -top-16 -left-16 w-48 h-48 rounded-full bg-[#6B7B3A]/[0.07] blur-3xl pointer-events-none" />
            <div aria-hidden className="absolute -bottom-16 -right-16 w-48 h-48 rounded-full bg-[#6B7B3A]/[0.07] blur-3xl pointer-events-none" />
            <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#6B7B3A]/30 to-transparent" />

            <div className="relative">
              <div className="inline-flex items-center gap-2 mb-4">
                <span className="w-6 h-px bg-[#6B7B3A]" />
                <span className="text-[11px] font-bold tracking-[0.15em] text-[#6B7B3A] uppercase">For Employers</span>
                <span className="w-6 h-px bg-[#6B7B3A]" />
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-[#2A251D] dark:text-zinc-100 mb-2 tracking-tight">
                우리 센터도 지도사를 찾고 있나요?
              </h2>
              <p className="text-[14px] text-[#6B5D47] dark:text-zinc-400 mb-6 max-w-md mx-auto leading-relaxed">
                모두의 지도사 커뮤니티에서 무료로 공고를 등록하고, 검증된 지도사와 연결되세요.
              </p>
              <Link
                href="/jobs/write"
                className="inline-flex items-center gap-2 px-7 py-3.5 bg-[#6B7B3A] hover:bg-[#5A6930] text-white font-semibold rounded-2xl shadow-[0_8px_24px_-8px_rgba(107,123,58,0.5)] transition-all hover:-translate-y-0.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                공고 등록하기
              </Link>
            </div>
          </div>
        </section>
      </div>

      {/* ─── 모바일 FAB ─── */}
      <Link
        href="/jobs/write"
        className="sm:hidden fixed right-4 bottom-6 z-40 flex items-center gap-2 px-5 py-3.5 bg-[#6B7B3A] hover:bg-[#5A6930] text-white font-semibold rounded-2xl shadow-[0_12px_32px_-12px_rgba(107,123,58,0.6)] transition-all active:scale-95"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
        </svg>
        <span className="text-sm">글쓰기</span>
      </Link>
    </div>
  );
}
