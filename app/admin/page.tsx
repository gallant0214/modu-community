"use client";

import { useState } from "react";
import Link from "next/link";
import { getReports, resolveReport, deleteReportTarget, getInquiries, hideInquiry, deleteInquiry } from "@/app/lib/actions";
import type { Report, Inquiry } from "@/app/lib/types";


export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [storedPassword, setStoredPassword] = useState("");
  const [error, setError] = useState("");
  const [reports, setReports] = useState<Report[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"pending" | "resolved" | "inquiries" | "kpi">("pending");
  const [reportFilter, setReportFilter] = useState<"all" | "post" | "job" | "comment" | "message">("all");
  const [kpiData, setKpiData] = useState<any>(null);
  const [kpiLoading, setKpiLoading] = useState(false);

  // KPI 기간 분석
  const [rangePreset, setRangePreset] = useState<"day" | "week" | "month" | "custom">("week");
  const [rangeFrom, setRangeFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().slice(0, 10);
  });
  const [rangeTo, setRangeTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [rangeData, setRangeData] = useState<any>(null);
  const [rangeLoading, setRangeLoading] = useState(false);

  function applyPreset(preset: "day" | "week" | "month") {
    const now = new Date();
    const to = new Date(now);
    const from = new Date(now);
    if (preset === "day") {
      // do nothing — same day
    } else if (preset === "week") {
      from.setDate(now.getDate() - 6);
    } else if (preset === "month") {
      from.setDate(now.getDate() - 29);
    }
    setRangeFrom(from.toISOString().slice(0, 10));
    setRangeTo(to.toISOString().slice(0, 10));
    setRangePreset(preset);
  }

  async function loadRangeKpi() {
    setRangeLoading(true);
    try {
      const res = await fetch("/api/admin/kpi/range", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: storedPassword, from: rangeFrom, to: rangeTo }),
      });
      const data = await res.json();
      if (!data.error) setRangeData(data);
    } catch {}
    setRangeLoading(false);
  }
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 문의사항 상태
  const [selectedInquiry, setSelectedInquiry] = useState<number | null>(null);
  const [deleteInquiryId, setDeleteInquiryId] = useState<number | null>(null);

  async function handleLogin() {
    if (!password.trim()) {
      setError("비밀번호를 입력해주세요");
      return;
    }
    setLoading(true);
    const [reportResult, inquiryResult] = await Promise.all([
      getReports(password),
      getInquiries(password),
    ]);
    setLoading(false);
    if (reportResult.error) {
      setError(reportResult.error);
      return;
    }
    setStoredPassword(password);
    setReports((reportResult.reports ?? []) as Report[]);
    setInquiries((inquiryResult.inquiries ?? []) as Inquiry[]);
    setAuthenticated(true);
  }

  async function handleResolve(id: number) {
    await resolveReport(id, storedPassword);
    setReports((prev) =>
      prev.map((r) => (r.id === id ? { ...r, resolved: true, resolved_at: new Date().toISOString() } : r))
    );
  }

  async function handleDelete(id: number) {
    setDeleting(true);
    await deleteReportTarget(id, storedPassword);
    setReports((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, resolved: true, resolved_at: new Date().toISOString(), deleted_at: new Date().toISOString() } : r
      )
    );
    setDeleteConfirmId(null);
    setDeleting(false);
  }

  async function handleResolveInquiry(id: number) {
    await hideInquiry(id, storedPassword);
    setInquiries((prev) =>
      prev.map((inq) => (inq.id === id ? { ...inq, hidden: true } : inq))
    );
    setSelectedInquiry(null);
  }

  async function handleDeleteInquiry(id: number) {
    setDeleting(true);
    await deleteInquiry(id, storedPassword);
    setInquiries((prev) => prev.filter((inq) => inq.id !== id));
    setDeleteInquiryId(null);
    setSelectedInquiry(null);
    setDeleting(false);
  }

  const pendingReports = reports.filter((r) => !r.resolved);
  const resolvedReports = reports.filter((r) => r.resolved);
  const pendingInquiries = inquiries.filter((inq) => !inq.hidden);
  const resolvedInquiries = inquiries.filter((inq) => inq.hidden);
  const baseReports = tab === "pending" ? pendingReports : resolvedReports;
  const displayReports = reportFilter === "all"
    ? baseReports
    : baseReports.filter((r) => r.target_type === reportFilter);

  // 미처리 신고 타입별 카운트
  const pendingByType = {
    post: pendingReports.filter((r) => r.target_type === "post").length,
    job: pendingReports.filter((r) => r.target_type === "job").length,
    comment: pendingReports.filter((r) => r.target_type === "comment").length,
    message: pendingReports.filter((r) => r.target_type === "message").length,
  };

  const selectedInq = inquiries.find((inq) => inq.id === selectedInquiry);

  if (!authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg dark:bg-zinc-900">
          <Link
            href="/"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            돌아가기
          </Link>
          <h1 className="mb-1 text-lg font-bold text-zinc-900 dark:text-zinc-100">
            관리자 페이지
          </h1>
          <p className="mb-5 text-sm text-zinc-500 dark:text-zinc-400">
            관리자 비밀번호를 입력해주세요.
          </p>
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            placeholder="관리자 비밀번호"
            className="mb-3 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-violet-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            onKeyDown={(e) => { if (e.key === "Enter") handleLogin(); }}
            autoFocus
          />
          {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full rounded-xl bg-violet-500 py-3 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-50"
          >
            {loading ? "확인 중..." : "로그인"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl lg:max-w-5xl">
        {/* Header */}
        <header className="flex items-center justify-between bg-white px-4 pb-3 pt-10 shadow-sm dark:bg-zinc-900">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              관리자 페이지
            </h1>
          </div>
        </header>

        {/* Tabs */}
        <div className="flex items-center border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <button
            onClick={() => setTab("pending")}
            className={`flex-1 py-3 text-center text-sm font-semibold transition-colors ${
              tab === "pending"
                ? "border-b-2 border-red-500 text-red-600 dark:text-red-400"
                : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            }`}
          >
            미처리 <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600 dark:bg-red-950 dark:text-red-400">{pendingReports.length}</span>
          </button>
          <button
            onClick={() => setTab("resolved")}
            className={`flex-1 py-3 text-center text-sm font-semibold transition-colors ${
              tab === "resolved"
                ? "border-b-2 border-green-500 text-green-600 dark:text-green-400"
                : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            }`}
          >
            처리완료 <span className="ml-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-600 dark:bg-green-950 dark:text-green-400">{resolvedReports.length + resolvedInquiries.length}</span>
          </button>
          <button
            onClick={() => setTab("inquiries")}
            className={`flex-1 py-3 text-center text-sm font-semibold transition-colors ${
              tab === "inquiries"
                ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
                : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            }`}
          >
            문의사항 <span className="ml-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-600 dark:bg-blue-950 dark:text-blue-400">{pendingInquiries.length}</span>
          </button>
          <button
            onClick={async () => {
              setTab("kpi");
              if (!kpiData) {
                setKpiLoading(true);
                try {
                  const res = await fetch("/api/admin/kpi", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ password: storedPassword }),
                  });
                  const data = await res.json();
                  if (!data.error) setKpiData(data);
                } catch {}
                setKpiLoading(false);
              }
            }}
            className={`flex-1 py-3 text-center text-sm font-semibold transition-colors ${
              tab === "kpi"
                ? "border-b-2 border-violet-500 text-violet-600 dark:text-violet-400"
                : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            }`}
          >
            KPI
          </button>
        </div>

        {/* Content */}

        {/* KPI 대시보드 */}
        {tab === "kpi" && (
          <div className="p-4">
            {kpiLoading ? (
              <div className="flex justify-center py-16">
                <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : kpiData ? (
              <div className="space-y-4">
                {/* 사용자 */}
                <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 p-4">
                  <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-3">사용자</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <KpiCard label="전체 가입자" value={kpiData.users.total} />
                    <KpiCard label="이번 달 신규" value={kpiData.users.thisMonth} accent />
                    <KpiCard label="이번 주 신규" value={kpiData.users.thisWeek} />
                    <KpiCard label="오늘 신규" value={kpiData.users.today} />
                  </div>
                </div>

                {/* 활성도 */}
                <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 p-4">
                  <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-3">활성도 (7일)</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <KpiCard label="글 작성자" value={kpiData.engagement.activePostersWeek} />
                    <KpiCard label="댓글 작성자" value={kpiData.engagement.activeCommentersWeek} />
                    <KpiCard label="게시글 좋아요" value={kpiData.engagement.postLikes} />
                    <KpiCard label="댓글 좋아요" value={kpiData.engagement.commentLikes} />
                  </div>
                </div>

                {/* 콘텐츠 */}
                <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 p-4">
                  <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-3">콘텐츠</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <KpiCard label="전체 게시글" value={kpiData.posts.total} />
                    <KpiCard label="이번 달 게시글" value={kpiData.posts.thisMonth} accent />
                    <KpiCard label="이번 주 게시글" value={kpiData.posts.thisWeek} />
                    <KpiCard label="전체 댓글" value={kpiData.comments.total} />
                  </div>
                </div>

                {/* 구인 */}
                <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 p-4">
                  <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-3">구인</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <KpiCard label="전체 구인글" value={kpiData.jobs.total} />
                    <KpiCard label="모집중" value={kpiData.jobs.open} accent />
                    <KpiCard label="모집종료" value={kpiData.jobs.closed} />
                    <KpiCard label="이번 달 등록" value={kpiData.jobs.thisMonth} />
                  </div>
                </div>

                {/* 북마크 */}
                <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 p-4">
                  <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-3">참여</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <KpiCard label="게시글 북마크" value={kpiData.engagement.postBookmarks} />
                    <KpiCard label="구인 북마크" value={kpiData.engagement.jobBookmarks} />
                    <KpiCard label="미처리 신고" value={kpiData.reports.pending} warn />
                    <KpiCard label="미답변 문의" value={kpiData.inquiries.pending} warn />
                  </div>
                </div>

                {/* 인기 카테고리 */}
                {kpiData.topCategories.length > 0 && (
                  <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 p-4">
                    <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-3">이번 달 인기 종목</h3>
                    <div className="space-y-2">
                      {kpiData.topCategories.map((c: { name: string; count: number }, i: number) => (
                        <div key={c.name} className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-400 text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                          <span className="flex-1 text-sm text-zinc-800 dark:text-zinc-200">{c.name}</span>
                          <span className="text-sm font-bold text-violet-600 dark:text-violet-400">{c.count}건</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 인기 게시글 */}
                {kpiData.topPosts.length > 0 && (
                  <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 p-4">
                    <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-3">이번 달 인기 게시글 (조회수)</h3>
                    <div className="space-y-2">
                      {kpiData.topPosts.map((p: { id: number; title: string; views: number; likes: number; comments: number }, i: number) => (
                        <div key={p.id} className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                          <span className="flex-1 text-sm text-zinc-800 dark:text-zinc-200 truncate">{p.title}</span>
                          <span className="shrink-0 text-[11px] text-zinc-400">조회 {p.views} · ♥ {p.likes} · 댓글 {p.comments}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 기간 분석 */}
                <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 p-4">
                  <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-3">기간 분석</h3>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {([
                      { key: "day" as const, label: "오늘" },
                      { key: "week" as const, label: "최근 7일" },
                      { key: "month" as const, label: "최근 30일" },
                      { key: "custom" as const, label: "직접 설정" },
                    ]).map((p) => (
                      <button
                        key={p.key}
                        onClick={() => p.key === "custom" ? setRangePreset("custom") : applyPreset(p.key)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                          rangePreset === p.key
                            ? "bg-violet-500 text-white"
                            : "border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <input
                      type="date"
                      value={rangeFrom}
                      onChange={(e) => { setRangeFrom(e.target.value); setRangePreset("custom"); }}
                      max={rangeTo}
                      className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                    />
                    <span className="text-xs text-zinc-400">~</span>
                    <input
                      type="date"
                      value={rangeTo}
                      onChange={(e) => { setRangeTo(e.target.value); setRangePreset("custom"); }}
                      min={rangeFrom}
                      max={new Date().toISOString().slice(0, 10)}
                      className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                    />
                    <button
                      onClick={loadRangeKpi}
                      disabled={rangeLoading}
                      className="rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-600 disabled:opacity-50"
                    >
                      {rangeLoading ? "조회 중..." : "조회"}
                    </button>
                  </div>
                  {rangeData ? (
                    <div className="space-y-3">
                      <div>
                        <p className="mb-1.5 text-[11px] font-semibold text-zinc-400">콘텐츠</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <KpiCard label="게시글" value={rangeData.posts} />
                          <KpiCard label="댓글" value={rangeData.comments} />
                        </div>
                      </div>
                      <div>
                        <p className="mb-1.5 text-[11px] font-semibold text-zinc-400">구인</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <KpiCard label="등록 구인글" value={rangeData.jobs} />
                        </div>
                      </div>
                      <div>
                        <p className="mb-1.5 text-[11px] font-semibold text-zinc-400">참여</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <KpiCard label="게시글 좋아요" value={rangeData.postLikes} />
                          <KpiCard label="댓글 좋아요" value={rangeData.commentLikes} />
                          <KpiCard label="게시글 북마크" value={rangeData.postBookmarks} />
                          <KpiCard label="구인 북마크" value={rangeData.jobBookmarks} />
                        </div>
                      </div>
                      <div>
                        <p className="mb-1.5 text-[11px] font-semibold text-zinc-400">스토어 클릭</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <KpiCard label="총 클릭" value={rangeData.storeClicks?.total || 0} accent />
                          <KpiCard label="Google Play" value={rangeData.storeClicks?.google_play || 0} />
                          <KpiCard label="App Store" value={rangeData.storeClicks?.app_store || 0} />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="py-4 text-center text-xs text-zinc-400">기간을 선택하고 조회 버튼을 눌러주세요.</p>
                  )}
                </div>

                {/* 새로고침 */}
                <button
                  onClick={async () => {
                    setKpiLoading(true);
                    try {
                      const res = await fetch("/api/admin/kpi", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ password: storedPassword }),
                      });
                      const data = await res.json();
                      if (!data.error) setKpiData(data);
                    } catch {}
                    setKpiLoading(false);
                  }}
                  className="w-full py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm font-semibold text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  새로고침
                </button>
              </div>
            ) : (
              <p className="text-center py-16 text-sm text-zinc-400">KPI 데이터를 불러올 수 없습니다.</p>
            )}
          </div>
        )}

        {/* 신고 목록 (미처리 / 처리완료) */}
        {(tab === "pending" || tab === "resolved") && (
          <div className="p-4">
            {/* 타입별 필터 (미처리 탭에서만 노출) */}
            {tab === "pending" && pendingReports.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {([
                  { key: "all", label: "전체", count: pendingReports.length, color: "zinc" },
                  { key: "post", label: "게시글", count: pendingByType.post, color: "violet" },
                  { key: "job", label: "구인글", count: pendingByType.job, color: "amber" },
                  { key: "comment", label: "댓글", count: pendingByType.comment, color: "blue" },
                  { key: "message", label: "쪽지", count: pendingByType.message, color: "pink" },
                ] as const).map((f) => {
                  const active = reportFilter === f.key;
                  return (
                    <button
                      key={f.key}
                      onClick={() => setReportFilter(f.key)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                        active
                          ? f.color === "violet" ? "bg-violet-500 text-white"
                          : f.color === "amber" ? "bg-amber-500 text-white"
                          : f.color === "blue" ? "bg-blue-500 text-white"
                          : f.color === "pink" ? "bg-pink-500 text-white"
                          : "bg-zinc-700 text-white dark:bg-zinc-200 dark:text-zinc-900"
                          : "border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
                      }`}
                    >
                      {f.label} <span className="ml-1 opacity-80">{f.count}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* 처리완료 탭일 때 처리된 문의도 표시 */}
            {tab === "resolved" && resolvedInquiries.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">처리된 문의사항</p>
                <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                  {resolvedInquiries.map((inq, i) => (
                    <button
                      key={inq.id}
                      onClick={() => setSelectedInquiry(selectedInquiry === inq.id ? null : inq.id)}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
                        i < resolvedInquiries.length - 1 ? "border-b border-zinc-100 dark:border-zinc-800" : ""
                      }`}
                    >
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-600 dark:bg-green-950 dark:text-green-400">완료</span>
                      <span className="flex-1 truncate text-sm text-zinc-900 dark:text-zinc-100">{inq.title}</span>
                      <span className="shrink-0 text-xs text-zinc-400">{inq.author}</span>
                      <span className="shrink-0 text-xs text-zinc-400">
                        {new Date(inq.created_at).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {displayReports.length === 0 && (tab === "pending" || resolvedInquiries.length === 0) ? (
              <div className="rounded-2xl bg-white py-16 text-center dark:bg-zinc-900">
                <p className="text-sm text-zinc-400">
                  {tab === "pending" ? "미처리 신고가 없습니다." : "처리 완료된 신고가 없습니다."}
                </p>
              </div>
            ) : displayReports.length > 0 && (
              <>
                {tab === "resolved" && resolvedInquiries.length > 0 && (
                  <p className="mb-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">처리된 신고</p>
                )}
                <div className="space-y-3">
                  {displayReports.map((report) => (
                    <div
                      key={report.id}
                      className={`rounded-2xl border bg-white p-4 dark:bg-zinc-900 ${
                        report.resolved
                          ? "border-green-200 dark:border-green-900"
                          : "border-zinc-200 dark:border-zinc-800"
                      }`}
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            report.target_type === "post"
                              ? "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-400"
                              : report.target_type === "job"
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                              : report.target_type === "message"
                              ? "bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-400"
                              : "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
                          }`}>
                            {report.target_type === "post" ? "종목후기" : report.target_type === "job" ? "구인글" : report.target_type === "message" ? "쪽지" : "댓글"}
                          </span>
                          {report.category_name && (
                            <span className="text-xs text-zinc-400">{report.category_name}</span>
                          )}
                          {report.resolved && report.deleted_at && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600 dark:bg-red-950 dark:text-red-400">삭제됨</span>
                          )}
                          {report.resolved && !report.deleted_at && (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-600 dark:bg-green-950 dark:text-green-400">처리됨</span>
                          )}
                        </div>
                        <span className="text-xs text-zinc-400">{new Date(report.created_at).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                      </div>

                      <div className="mb-3 rounded-xl bg-zinc-50 px-4 py-3 dark:bg-zinc-800">
                        {report.target_type === "post" ? (
                          <>
                            <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">신고된 종목후기</p>
                            <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{report.post_title || "(삭제된 게시글)"}</p>
                            <p className="mt-0.5 text-xs text-zinc-400">작성자: {report.post_author || "-"}</p>
                          </>
                        ) : report.target_type === "message" ? (
                          <>
                            <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">신고된 쪽지</p>
                            <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">{report.message_content || "(삭제된 쪽지)"}</p>
                            <p className="mt-0.5 text-xs text-zinc-400">발신자: {report.message_sender || "-"}</p>
                            {report.message_receiver && (
                              <p className="text-xs text-zinc-400">수신자: {report.message_receiver}</p>
                            )}
                          </>
                        ) : report.target_type === "job" ? (
                          <>
                            <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">신고된 구인글</p>
                            <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{report.job_title || "(삭제된 구인글)"}</p>
                            <p className="mt-0.5 text-xs text-zinc-400">작성자: {report.job_author || "-"}</p>
                          </>
                        ) : (
                          <>
                            <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">신고된 댓글</p>
                            <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">{report.comment_content || "(삭제된 댓글)"}</p>
                            <p className="mt-0.5 text-xs text-zinc-400">작성자: {report.comment_author || "-"}</p>
                            <hr className="my-2 border-zinc-200 dark:border-zinc-700" />
                            <p className="text-xs text-zinc-400">게시글: {report.post_title || "(삭제된 게시글)"}</p>
                          </>
                        )}
                      </div>

                      <div className="mb-3 rounded-xl bg-red-50 px-4 py-3 dark:bg-red-950/30">
                        <p className="text-xs font-semibold text-red-600 dark:text-red-400">신고 사유</p>
                        <p className="mt-1 text-sm text-red-700 dark:text-red-300">{report.reason}</p>
                        {report.custom_reason && (
                          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{report.custom_reason}</p>
                        )}
                      </div>

                      {report.deleted_at && (
                        <div className="mb-3 rounded-xl bg-zinc-100 px-4 py-3 dark:bg-zinc-800">
                          <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">삭제 기록</p>
                          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                            관리자에 의해 {report.target_type === "post" ? "게시글이" : report.target_type === "job" ? "구인글이" : "댓글이"} 삭제되었습니다.
                          </p>
                          <p className="mt-0.5 text-xs text-zinc-400">삭제 시각: {new Date(report.deleted_at).toLocaleString("ko-KR")}</p>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {!report.resolved && (
                          <button
                            onClick={() => setDeleteConfirmId(report.id)}
                            className="rounded-lg bg-red-500 px-4 py-2 text-xs font-semibold text-white hover:bg-red-600"
                          >
                            삭제하기
                          </button>
                        )}
                        <Link
                          href={`/category/${report.category_id}/post/${report.post_id}`}
                          className="rounded-lg bg-violet-500 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-600"
                        >
                          바로가기
                        </Link>
                        {!report.resolved && (
                          <button
                            onClick={() => handleResolve(report.id)}
                            className="rounded-lg border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                          >
                            처리 완료
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* 문의사항 목록 - 게시판 형태 */}
        {tab === "inquiries" && (
          <div className="bg-white dark:bg-zinc-900">
            {pendingInquiries.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-sm text-zinc-400">등록된 문의가 없습니다.</p>
              </div>
            ) : (
              <>
                {/* 데스크톱: 테이블 형태 */}
                <div className="hidden sm:block">
                  <div className="flex items-center border-b border-zinc-300 bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                    <span className="w-12 text-center">번호</span>
                    <span className="flex-1 pl-3">제목</span>
                    <span className="w-20 text-center">글쓴이</span>
                    <span className="w-24 text-center">날짜</span>
                  </div>
                  {pendingInquiries.map((inq, i) => (
                    <button
                      key={inq.id}
                      onClick={() => setSelectedInquiry(selectedInquiry === inq.id ? null : inq.id)}
                      className={`flex w-full items-center px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
                        i < pendingInquiries.length - 1 ? "border-b border-zinc-100 dark:border-zinc-800" : ""
                      } ${selectedInquiry === inq.id ? "bg-zinc-50 dark:bg-zinc-800" : ""}`}
                    >
                      <span className="w-12 text-center text-xs text-zinc-400">{pendingInquiries.length - i}</span>
                      <span className="flex-1 truncate pl-3 text-sm text-zinc-900 dark:text-zinc-100">{inq.title}</span>
                      <span className="w-20 text-center text-xs text-zinc-500 dark:text-zinc-400">{inq.author}</span>
                      <span className="w-24 text-center text-xs text-zinc-400">
                        {new Date(inq.created_at).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}
                      </span>
                    </button>
                  ))}
                </div>

                {/* 모바일: 카드 형태 */}
                <div className="sm:hidden divide-y divide-zinc-100 dark:divide-zinc-800">
                  {pendingInquiries.map((inq, i) => (
                    <button
                      key={inq.id}
                      onClick={() => setSelectedInquiry(selectedInquiry === inq.id ? null : inq.id)}
                      className={`w-full text-left px-4 py-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
                        selectedInquiry === inq.id ? "bg-zinc-50 dark:bg-zinc-800" : ""
                      }`}
                    >
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-1 leading-snug">{inq.title}</p>
                      <div className="flex items-center gap-2 text-xs text-zinc-400">
                        <span>{inq.author}</span>
                        <span>·</span>
                        <span>{new Date(inq.created_at).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* 문의 상세 모달 */}
      {selectedInq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            {/* 헤더 */}
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">문의 상세</h3>
              <button
                onClick={() => setSelectedInquiry(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 정보 */}
            <div className="select-text space-y-3">
              <div className="flex border-b border-zinc-100 pb-2 dark:border-zinc-800">
                <span className="w-16 shrink-0 text-sm font-medium text-zinc-500 dark:text-zinc-400">이름</span>
                <span className="text-sm text-zinc-900 dark:text-zinc-100">{selectedInq.author}</span>
              </div>
              <div className="flex border-b border-zinc-100 pb-2 dark:border-zinc-800">
                <span className="w-16 shrink-0 text-sm font-medium text-zinc-500 dark:text-zinc-400">이메일</span>
                <span className="text-sm text-zinc-900 dark:text-zinc-100">{selectedInq.email || "-"}</span>
              </div>
              <div className="flex border-b border-zinc-100 pb-2 dark:border-zinc-800">
                <span className="w-16 shrink-0 text-sm font-medium text-zinc-500 dark:text-zinc-400">제목</span>
                <span className="text-sm text-zinc-900 dark:text-zinc-100">{selectedInq.title}</span>
              </div>
              <div>
                <span className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">내용</span>
                <div className="rounded-xl bg-zinc-50 px-4 py-3 dark:bg-zinc-800">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                    {selectedInq.content}
                  </p>
                </div>
              </div>
            </div>

            {/* 버튼 */}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setDeleteInquiryId(selectedInq.id)}
                className="rounded-lg bg-red-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-600"
              >
                삭제
              </button>
              {!selectedInq.hidden && (
                <button
                  onClick={() => handleResolveInquiry(selectedInq.id)}
                  className="rounded-lg bg-green-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-600"
                >
                  처리완료
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 신고 삭제 확인 모달 */}
      {deleteConfirmId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">삭제하시겠습니까?</h3>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              신고된 {reports.find((r) => r.id === deleteConfirmId)?.target_type === "post" ? "게시글" : reports.find((r) => r.id === deleteConfirmId)?.target_type === "job" ? "구인글" : "댓글"}을 삭제하고 처리 완료로 이동합니다.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                disabled={deleting}
                className="rounded-lg border border-zinc-200 px-5 py-2.5 text-sm font-semibold text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                아니오
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                disabled={deleting}
                className="rounded-lg bg-red-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"
              >
                {deleting ? "삭제 중..." : "예"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 문의 삭제 확인 모달 */}
      {deleteInquiryId !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">문의를 삭제하시겠습니까?</h3>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              삭제된 문의는 복구할 수 없습니다.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setDeleteInquiryId(null)}
                disabled={deleting}
                className="rounded-lg border border-zinc-200 px-5 py-2.5 text-sm font-semibold text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                아니오
              </button>
              <button
                onClick={() => handleDeleteInquiry(deleteInquiryId)}
                disabled={deleting}
                className="rounded-lg bg-red-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"
              >
                {deleting ? "삭제 중..." : "예"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* KPI 카드 */
function KpiCard({ label, value, accent, warn }: { label: string; value: number; accent?: boolean; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800 p-3 text-center">
      <p className={`text-xl font-bold ${warn && value > 0 ? "text-red-500" : accent ? "text-violet-600 dark:text-violet-400" : "text-zinc-800 dark:text-zinc-100"}`}>
        {value.toLocaleString()}
      </p>
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">{label}</p>
    </div>
  );
}
