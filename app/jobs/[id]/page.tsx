"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { JobPost } from "@/app/lib/types";
import { useAuth } from "@/app/components/auth-provider";
import { shareOrCopy } from "@/app/lib/share";
import { createReport } from "@/app/lib/actions";
import { formatSalaryDisplay, formatDeadlineDisplay } from "@/app/lib/job-format";

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`;
}


/* 스펙 그리드 항목 */
function SpecItem({ label, value, icon }: { label: string; value?: string; icon: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-3">
      <span className="shrink-0 w-8 h-8 rounded-lg bg-[#F5F0E5] dark:bg-zinc-800 text-[#6B7B3A] dark:text-[#A8B87A] flex items-center justify-center">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-[#A89B80] dark:text-zinc-500 font-semibold mb-0.5">{label}</p>
        <p className="text-sm text-[#3A342A] dark:text-zinc-100 font-medium break-words">{value}</p>
      </div>
    </div>
  );
}

/* 아이콘 */
const Icon = {
  sport: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>,
  type: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>,
  salary: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>,
  headcount: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>,
  region: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>,
  address: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>,
  deadline: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>,
  benefits: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>,
  preferences: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/></svg>,
};

export default function JobDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const jobId = params.id as string;

  // 뒤로가기 타겟: from 쿼리가 있으면 그곳으로, 없으면 구인 목록으로
  const fromParam = searchParams.get("from");
  const backHref = fromParam && fromParam.startsWith("/") ? fromParam : "/jobs";
  const backLabel = fromParam && fromParam.startsWith("/my") ? "MY 페이지" : "스포츠 구인";
  const { user, getIdToken } = useAuth();

  const [job, setJob] = useState<JobPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [showContact, setShowContact] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportCustomReason, setReportCustomReason] = useState("");
  const [reportDone, setReportDone] = useState(false);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminDelete, setShowAdminDelete] = useState(false);
  const [adminDeleting, setAdminDeleting] = useState(false);

  // 관리자 여부 체크
  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    getIdToken().then(token => {
      if (!token) return;
      fetch("/api/auth/is-admin", { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(d => setIsAdmin(!!d.isAdmin)).catch(() => {});
    });
  }, [user, getIdToken]);

  // 관리자 삭제
  const handleAdminDelete = async () => {
    setAdminDeleting(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) router.replace(backHref);
    } catch {}
    setAdminDeleting(false);
  };

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) { router.replace("/jobs"); return; }
        const data = await res.json();
        setJob(data);
        // 조회수 증가
        fetch(`/api/jobs/${jobId}/view`, { method: "POST" }).catch(() => {});
        // 북마크 상태
        const token = await getIdToken();
        if (token) {
          fetch(`/api/jobs/${jobId}/bookmark`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json()).then(d => { if (d.bookmarked) setBookmarked(true); }).catch(() => {});
        }
      } catch {
        router.replace("/jobs");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [jobId, router]);

  const handleShare = async () => {
    if (!job) return;
    const result = await shareOrCopy({
      title: job.title,
      text: `"${job.title}"\n${job.center_name || ""} ${job.region_name || ""}\n\n모두의 지도사 커뮤니티에서 보기`,
      url: `https://moducm.com/jobs/${job.id}`,
    });
    if (result === "copied") {
      setShareToast("링크가 복사되었습니다");
      setTimeout(() => setShareToast(null), 2000);
    }
  };

  const handleDelete = async () => {
    if (!job) return;
    setDeleting(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        router.replace(backHref);
      }
    } catch {
      setDeleting(false);
    }
  };

  const handleClose = async () => {
    if (!job) return;
    try {
      const token = await getIdToken();
      await fetch(`/api/jobs/${jobId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ is_closed: !job.is_closed }),
      });
      setJob((prev) => prev ? { ...prev, is_closed: !prev.is_closed } : prev);
    } catch {}
  };

  const isOwner = user && job && user.uid === job.firebase_uid;

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-[#F8F4EC] dark:bg-zinc-950">
        <div className="w-7 h-7 border-2 border-[#6B7B3A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!job) return null;

  return (
    <div className="min-h-screen bg-[#F8F4EC] dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-4 sm:py-6">

        {/* 상단 바 */}
        <div className="flex items-center gap-2 mb-4">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 -ml-1 px-1 py-0.5 rounded-lg text-[#6B7B3A] hover:bg-[#F5F0E5]/60 dark:hover:bg-zinc-800 transition-colors flex-1"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-[11px] font-bold tracking-[0.15em] uppercase">{backLabel}</span>
          </Link>
          <div className="flex items-center gap-1.5">
            {(isOwner || isAdmin) && (
              <>
                <Link
                  href={`/jobs/${jobId}/edit`}
                  className="px-3 py-1.5 text-xs border border-[#E8E0D0] dark:border-zinc-700 rounded-lg text-[#6B5D47] dark:text-zinc-400 bg-[#FEFCF7] dark:bg-zinc-900 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 transition-colors"
                >수정</Link>
                <button
                  onClick={handleClose}
                  className={`px-3 py-1.5 text-xs border rounded-lg transition-colors ${
                    job.is_closed
                      ? "border-[#6B7B3A] text-[#6B7B3A] bg-[#F5F0E5] hover:bg-[#EFE7D5]"
                      : "border-[#E8E0D0] dark:border-zinc-700 text-[#6B5D47] dark:text-zinc-400 bg-[#FEFCF7] dark:bg-zinc-900 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
                  }`}
                >{job.is_closed ? "모집재개" : "모집종료"}</button>
                <button
                  onClick={() => isOwner ? setShowDeleteConfirm(true) : setShowAdminDelete(true)}
                  className="px-3 py-1.5 text-xs border border-red-200 dark:border-red-900 rounded-lg text-red-500 bg-[#FEFCF7] dark:bg-zinc-900 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                >삭제</button>
              </>
            )}
          </div>
        </div>

        {/* 히어로 카드 */}
        <section className="relative bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-6 sm:p-8 mb-4 shadow-[0_1px_0_rgba(0,0,0,0.02),0_12px_32px_-20px_rgba(107,93,71,0.25)] overflow-hidden">
          {/* 장식용 배경 */}
          <div aria-hidden className="absolute -top-20 -right-16 w-56 h-56 rounded-full bg-[#6B7B3A]/[0.06] blur-3xl pointer-events-none" />
          <div aria-hidden className="absolute top-0 right-0 w-full h-1 bg-gradient-to-r from-transparent via-[#6B7B3A]/20 to-transparent" />

          <div className="relative">
            {/* 뱃지 */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="inline-flex items-center px-2.5 py-1 bg-[#6B7B3A] text-white text-[11px] font-semibold rounded-full">
                {job.sport}
              </span>
              {job.employment_type && (
                <span className="inline-flex items-center px-2.5 py-1 bg-[#F5F0E5] dark:bg-zinc-800 text-[#6B5D47] dark:text-zinc-300 text-[11px] font-medium rounded-full border border-[#E8E0D0]/80 dark:border-zinc-700">
                  {job.employment_type}
                </span>
              )}
              {job.is_closed ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 text-[#8C8270] dark:text-zinc-500 text-[11px] font-semibold rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#8C8270]" />모집 종료
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#EFE7D5] text-[#6B7B3A] text-[11px] font-semibold rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#6B7B3A] animate-pulse" />모집 중
                </span>
              )}
              <button
                onClick={() => { setShowReportModal(true); setReportReason(""); setReportCustomReason(""); setReportDone(false); }}
                className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold text-[#C0392B] hover:bg-[#C0392B]/10 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                신고
              </button>
            </div>

            {/* 제목 */}
            <h1 className="text-2xl sm:text-[26px] font-bold text-[#2A251D] dark:text-zinc-100 leading-tight tracking-tight mb-2">
              {job.title}
            </h1>

            {/* 센터 & 지역 */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-5">
              {job.center_name && (
                <span className="inline-flex items-center gap-1.5 text-[15px] font-medium text-[#3A342A] dark:text-zinc-200">
                  <svg className="w-4 h-4 text-[#6B7B3A]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                  </svg>
                  {job.center_name}
                </span>
              )}
              {job.region_name && (
                <>
                  <span className="text-[#C7B89B] dark:text-zinc-600">·</span>
                  <span className="inline-flex items-center gap-1 text-[14px] text-[#6B5D47] dark:text-zinc-400">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                    </svg>
                    {job.region_name}
                  </span>
                </>
              )}
            </div>

            {/* 핵심 스펙 하이라이트 */}
            {(job.salary || job.deadline) && (
              <div className="grid grid-cols-2 gap-3 mb-5">
                {job.salary && (
                  <div className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB] dark:bg-zinc-800/60 px-4 py-3">
                    <p className="text-[10px] uppercase tracking-wider text-[#A89B80] dark:text-zinc-500 font-semibold mb-0.5">급여</p>
                    <p className="text-sm font-semibold text-[#6B7B3A] dark:text-[#A8B87A] break-words">{formatSalaryDisplay(job.salary)}</p>
                  </div>
                )}
                {formatDeadlineDisplay(job.deadline) && (
                  <div className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB] dark:bg-zinc-800/60 px-4 py-3">
                    <p className="text-[10px] uppercase tracking-wider text-[#A89B80] dark:text-zinc-500 font-semibold mb-0.5">마감일</p>
                    <p className="text-sm font-semibold text-[#3A342A] dark:text-zinc-100 break-words">{formatDeadlineDisplay(job.deadline)}</p>
                  </div>
                )}
              </div>
            )}

            {/* 등록일·조회 */}
            <div className="flex items-center gap-3 text-[11px] text-[#A89B80] dark:text-zinc-500 pt-4 border-t border-[#E8E0D0]/70 dark:border-zinc-800">
              <span className="inline-flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                {formatDate(job.created_at)} 등록
              </span>
              <span className="text-[#E8E0D0] dark:text-zinc-700">|</span>
              <span className="inline-flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
                조회 {job.views}
              </span>
            </div>
          </div>
        </section>

        {/* 설명 카드 */}
        <section className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-6 sm:p-7 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-1 h-4 rounded-full bg-[#6B7B3A]" />
            <h2 className="text-sm font-bold tracking-wide text-[#3A342A] dark:text-zinc-200 uppercase">공고 소개</h2>
          </div>
          <div className="text-[15px] text-[#3A342A] dark:text-zinc-200 leading-[1.85] whitespace-pre-wrap font-normal">
            {job.description}
          </div>
        </section>

        {/* 상세 정보 - 스펙 그리드 */}
        <section className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-6 sm:p-7 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-1 h-4 rounded-full bg-[#6B7B3A]" />
            <h2 className="text-sm font-bold tracking-wide text-[#3A342A] dark:text-zinc-200 uppercase">채용 상세</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 divide-y divide-[#E8E0D0]/70 dark:divide-zinc-800 sm:divide-y-0">
            <div className="sm:border-r sm:border-[#E8E0D0]/70 sm:dark:border-zinc-800 sm:pr-6">
              <SpecItem label="종목" value={job.sport} icon={Icon.sport} />
              <SpecItem label="근무형태" value={job.employment_type} icon={Icon.type} />
              <SpecItem label="급여" value={formatSalaryDisplay(job.salary)} icon={Icon.salary} />
              <SpecItem label="모집인원" value={job.headcount} icon={Icon.headcount} />
              <SpecItem label="마감일" value={formatDeadlineDisplay(job.deadline)} icon={Icon.deadline} />
            </div>
            <div className="sm:pl-6">
              <SpecItem label="주소" value={job.address} icon={Icon.address} />
              {job.benefits && <SpecItem label="복리후생" value={job.benefits} icon={Icon.benefits} />}
              {job.preferences && <SpecItem label="우대사항" value={job.preferences} icon={Icon.preferences} />}
            </div>
          </div>
        </section>

        {/* 연락처 CTA */}
        <section className="relative bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-6 sm:p-7 mb-4 overflow-hidden">
          <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#6B7B3A]/40 to-transparent" />
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="shrink-0 w-11 h-11 rounded-full bg-[#F5F0E5] dark:bg-zinc-800 flex items-center justify-center">
                <svg className="w-5 h-5 text-[#6B7B3A] dark:text-[#A8B87A]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wider text-[#A89B80] dark:text-zinc-500 font-semibold mb-0.5">담당자 연락처</p>
                <p className="text-base font-semibold text-[#3A342A] dark:text-zinc-100 truncate">
                  {job.author_role && <span className="text-xs text-[#8C8270] font-normal mr-1.5">{job.author_role}</span>}
                  {job.author_name || job.center_name || "담당자"}
                </p>
                {job.contact_type && job.contact_type !== "고용24" && <p className="text-xs text-[#8C8270] dark:text-zinc-500 mt-0.5">{job.contact_type}</p>}
              </div>
            </div>
            <button
              onClick={() => setShowContact(!showContact)}
              className={`group inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all shrink-0 ${
                showContact
                  ? "bg-[#F5F0E5] text-[#6B5D47] border border-[#E8E0D0] hover:bg-[#EFE7D5]"
                  : "bg-[#6B7B3A] text-white border border-[#6B7B3A] hover:bg-[#5A6930] shadow-[0_4px_14px_-4px_rgba(107,123,58,0.5)]"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d={showContact ? "M6 18L18 6M6 6l12 12" : "M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"} />
              </svg>
              {showContact ? "숨기기" : "연락처 보기"}
            </button>
          </div>
          {showContact && (
            <div className="mt-5 pt-5 border-t border-[#E8E0D0]/70 dark:border-zinc-800">
              <div className="bg-[#F5F0E5]/60 dark:bg-zinc-800/60 border border-[#E8E0D0]/80 dark:border-zinc-700 rounded-2xl px-5 py-4">
                <p className="text-[11px] uppercase tracking-wider text-[#A89B80] dark:text-zinc-500 font-semibold mb-1">
                  {job.contact_type === "고용24" ? "채용 상세정보" : "연락처"}
                </p>
                {job.contact_type === "고용24" ? (
                  <a href={job.contact} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#6B7B3A] hover:bg-[#5A6930] text-white text-[14px] font-semibold rounded-xl transition-colors">
                    고용24에서 상세보기
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                ) : (
                  <p className="text-lg font-bold text-[#3A342A] dark:text-zinc-100 select-all break-all">{job.contact}</p>
                )}
              </div>
            </div>
          )}
        </section>

        {/* 북마크 & 공유 액션 */}
        <div className="flex gap-2.5 mb-8">
          <button
            onClick={async () => {
              if (!user) { alert("로그인 후 이용 가능합니다"); return; }
              const token = await getIdToken();
              const res = await fetch(`/api/jobs/${jobId}/bookmark`, {
                method: "POST",
                headers: token ? { Authorization: `Bearer ${token}` } : {},
              });
              if (res.ok) setBookmarked(!bookmarked);
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border transition-all font-medium text-sm ${
              bookmarked
                ? "bg-[#6B7B3A] border-[#6B7B3A] text-white shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)]"
                : "bg-[#FEFCF7] border-[#E8E0D0] text-[#6B5D47] hover:bg-[#F5F0E5] dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            <svg className="w-4.5 h-4.5" width="18" height="18" fill={bookmarked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
            </svg>
            {bookmarked ? "북마크 저장됨" : "북마크"}
          </button>
          <button
            onClick={handleShare}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border border-[#E8E0D0] bg-[#FEFCF7] text-[#6B5D47] hover:bg-[#F5F0E5] dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-all font-medium text-sm"
          >
            <svg className="w-4.5 h-4.5" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
            </svg>
            공유하기
          </button>
        </div>

        {/* 공유 토스트 */}
        {shareToast && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-[#3A342A] text-[#FEFCF7] px-5 py-3 rounded-full text-sm font-medium shadow-lg animate-fade-in">
            {shareToast}
          </div>
        )}

        {/* 신고 모달 */}
        {showReportModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4">
            <div className="absolute inset-0 bg-[#2A251D]/50 backdrop-blur-sm" onClick={() => setShowReportModal(false)} />
            <div className="relative w-full max-w-sm bg-[#FEFCF7] dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-[#E8E0D0] dark:border-zinc-700 px-6 pb-6 pt-4 overflow-hidden">
              <div className="mb-4 flex justify-center sm:hidden">
                <div className="h-1 w-10 rounded-full bg-[#E8E0D0] dark:bg-zinc-600" />
              </div>
              <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#C0392B]/40 to-transparent" />

              {reportDone ? (
                <div className="py-8 text-center">
                  <p className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100 tracking-tight">신고가 접수되었습니다</p>
                  <p className="mt-2 text-[13px] text-[#8C8270] dark:text-zinc-400">검토 후 조치하겠습니다</p>
                  <button
                    onClick={() => setShowReportModal(false)}
                    className="mt-6 w-full rounded-xl bg-[#6B7B3A] hover:bg-[#5A6930] py-3 text-[13px] font-bold text-white shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)]"
                  >
                    확인
                  </button>
                </div>
              ) : (
                <>
                  <h3 className="mb-5 text-center text-[15px] font-bold text-[#2A251D] dark:text-zinc-100 tracking-tight">
                    해당 공고를 어떤 이유로 신고하시나요?
                  </h3>

                  <div className="space-y-2">
                    {["허위 구인 공고", "스팸/영리목적 홍보", "욕설/비하발언", "부적절한 콘텐츠", "기타"].map((reason) => (
                      <div key={reason}>
                        <button
                          onClick={() => {
                            setReportReason(reason);
                            if (reason !== "기타") setReportCustomReason("");
                          }}
                          className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3.5 text-[13px] transition-all ${
                            reportReason === reason
                              ? "border-[#6B7B3A] bg-[#F5F0E5] font-semibold text-[#2A251D] dark:bg-[#6B7B3A]/20 dark:text-zinc-100"
                              : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB]/40 dark:bg-zinc-800/40 text-[#3A342A] dark:text-zinc-300 hover:border-[#6B7B3A]/40"
                          }`}
                        >
                          <span>{reason}</span>
                          <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                            reportReason === reason
                              ? "border-[#6B7B3A] bg-[#6B7B3A]"
                              : "border-[#E8E0D0] dark:border-zinc-600"
                          }`}>
                            {reportReason === reason && (
                              <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <circle cx="10" cy="10" r="4" />
                              </svg>
                            )}
                          </span>
                        </button>
                        {reason === "기타" && (
                          <div
                            className="overflow-hidden transition-all duration-300 ease-in-out"
                            style={{
                              maxHeight: reportReason === "기타" ? "150px" : "0px",
                              opacity: reportReason === "기타" ? 1 : 0,
                            }}
                          >
                            <textarea
                              value={reportCustomReason}
                              onChange={(e) => setReportCustomReason(e.target.value)}
                              placeholder="신고 사유를 입력해주세요"
                              rows={3}
                              className="mt-2 w-full resize-none rounded-xl border border-[#6B7B3A]/40 bg-[#FBF7EB] dark:bg-zinc-800 px-4 py-3 text-[13px] leading-relaxed text-[#2A251D] dark:text-zinc-100 placeholder:text-[#A89B80] focus:border-[#6B7B3A]/60 focus:outline-none"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 flex gap-2">
                    <button
                      onClick={() => setShowReportModal(false)}
                      className="flex flex-1 items-center justify-center rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-800 py-3 text-[13px] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-700"
                    >
                      취소
                    </button>
                    <button
                      onClick={async () => {
                        if (!user) { alert("로그인 후 이용 가능합니다"); return; }
                        if (!reportReason) return;
                        const token = await getIdToken();
                        if (!token) { alert("로그인이 필요합니다"); return; }
                        const r = await createReport(
                          "post",
                          Number(jobId),
                          Number(jobId),
                          0,
                          reportReason,
                          reportReason === "기타" ? reportCustomReason : undefined,
                          token,
                        );
                        if (r && "error" in r && r.error) { alert(r.error); return; }
                        setReportDone(true);
                      }}
                      className={`flex flex-1 items-center justify-center rounded-xl py-3 text-[13px] font-bold text-white transition-colors ${
                        reportReason
                          ? "bg-[#C0392B] hover:bg-[#A0311F] shadow-[0_4px_14px_-4px_rgba(192,57,43,0.4)]"
                          : "cursor-not-allowed bg-[#D4C7AA] dark:bg-zinc-600"
                      }`}
                    >
                      신고하기
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* 삭제 확인 */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-[#2A251D]/50 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)} />
            <div className="relative bg-[#FEFCF7] dark:bg-zinc-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-[#E8E0D0] dark:border-zinc-700">
              <h3 className="text-base font-bold text-[#3A342A] dark:text-zinc-100 mb-2">게시글 삭제</h3>
              <p className="text-sm text-[#6B5D47] dark:text-zinc-400 mb-5">정말 삭제하시겠습니까? 되돌릴 수 없습니다.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2.5 text-sm border border-[#E8E0D0] dark:border-zinc-700 rounded-xl text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
                >취소</button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 py-2.5 text-sm bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold disabled:opacity-50"
                >{deleting ? "삭제 중..." : "삭제"}</button>
              </div>
            </div>
          </div>
        )}

        {/* 관리자 삭제 확인 모달 */}
        {showAdminDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-[#2A251D]/50 backdrop-blur-sm" onClick={() => setShowAdminDelete(false)} />
            <div className="relative bg-[#FEFCF7] dark:bg-zinc-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-[#E8E0D0] dark:border-zinc-700">
              <h3 className="text-base font-bold text-red-600 mb-2">관리자 삭제</h3>
              <p className="text-sm text-[#6B5D47] dark:text-zinc-400 mb-5">이 구인글을 관리자 권한으로 삭제하시겠습니까?<br />삭제된 글은 복구할 수 없습니다.</p>
              <div className="flex gap-2">
                <button onClick={() => setShowAdminDelete(false)} disabled={adminDeleting}
                  className="flex-1 py-2.5 text-sm border border-[#E8E0D0] dark:border-zinc-700 rounded-xl text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800">취소</button>
                <button onClick={handleAdminDelete} disabled={adminDeleting}
                  className="flex-1 py-2.5 text-sm bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold disabled:opacity-50">
                  {adminDeleting ? "삭제 중..." : "삭제"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
