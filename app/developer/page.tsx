"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { signInWithPopup, onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth, googleProvider } from "@/app/lib/firebase-client";
import { getReports, resolveReport, deleteReportTarget, getInquiries, hideInquiry, unhideInquiry, deleteInquiry, replyToInquiry } from "@/app/lib/actions";
import type { Report, Inquiry } from "@/app/lib/types";

type AuthStep = "loading" | "google" | "blocked" | "password" | "authenticated";

export default function AdminPage() {
  const [authStep, setAuthStep] = useState<AuthStep>("loading");
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [password, setPassword] = useState("");
  const [storedPassword, setStoredPassword] = useState("");
  const [error, setError] = useState("");
  const [reports, setReports] = useState<Report[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"pending" | "resolved" | "inquiries" | "settings">("pending");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // 문의사항 상태
  const [selectedInquiry, setSelectedInquiry] = useState<number | null>(null);
  const [deleteInquiryId, setDeleteInquiryId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);

  // 비밀번호 변경 상태
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwMsg, setPwMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [changingPw, setChangingPw] = useState(false);

  // 관리자 이메일 관리 상태
  const [adminEmails, setAdminEmails] = useState<{ id: number; email: string; created_at: string }[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [emailMsg, setEmailMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [deleteEmailConfirm, setDeleteEmailConfirm] = useState<string | null>(null);

  // Firebase 인증 상태 감지
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user && user.email) {
        setFirebaseUser(user);
        // 관리자 이메일 확인
        try {
          const token = await user.getIdToken();
          const res = await fetch("/api/admin/verify-email", {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}` },
          });
          if (res.ok) {
            setAuthStep("password");
          } else {
            setAuthStep("blocked");
          }
        } catch {
          setAuthStep("blocked");
        }
      } else {
        setFirebaseUser(null);
        setAuthStep("google");
      }
    });
    return () => unsubscribe();
  }, []);

  async function handleGoogleLogin() {
    setLoading(true);
    setError("");
    try {
      await signInWithPopup(auth, googleProvider);
    } catch {
      setError("Google 로그인에 실패했습니다");
      setLoading(false);
    }
  }

  async function handleGoogleLogout() {
    await signOut(auth);
    setAuthStep("google");
    setFirebaseUser(null);
  }

  const fetchData = useCallback(async (pw: string) => {
    const [reportResult, inquiryResult] = await Promise.all([
      getReports(pw),
      getInquiries(pw),
    ]);
    if (reportResult.error) return false;
    setReports((reportResult.reports ?? []) as Report[]);
    setInquiries((inquiryResult.inquiries ?? []) as Inquiry[]);
    return true;
  }, []);

  async function handleLogin() {
    if (!password.trim()) { setError("비밀번호를 입력해주세요"); return; }
    setLoading(true);
    const ok = await fetchData(password);
    setLoading(false);
    if (!ok) { setError("비밀번호가 일치하지 않습니다"); return; }
    setStoredPassword(password);
    setAuthStep("authenticated");
  }

  async function handleRefresh() {
    setRefreshing(true);
    await fetchData(storedPassword);
    setRefreshing(false);
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
    setInquiries((prev) => prev.map((inq) => (inq.id === id ? { ...inq, hidden: true } : inq)));
    setSelectedInquiry(null);
  }

  async function handleUnhideInquiry(id: number) {
    await unhideInquiry(id, storedPassword);
    setInquiries((prev) => prev.map((inq) => (inq.id === id ? { ...inq, hidden: false } : inq)));
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

  async function handleReply(id: number) {
    if (!replyText.trim()) return;
    setReplying(true);
    await replyToInquiry(id, storedPassword, replyText.trim());
    setInquiries((prev) =>
      prev.map((inq) => (inq.id === id ? { ...inq, reply: replyText.trim(), replied_at: new Date().toISOString() } : inq))
    );
    setReplyText("");
    setReplying(false);
  }

  async function handleChangePassword() {
    if (!currentPw.trim() || !newPw.trim() || !confirmPw.trim()) { setPwMsg({ type: "error", text: "모든 항목을 입력해주세요" }); return; }
    if (newPw.length < 4) { setPwMsg({ type: "error", text: "새 비밀번호는 4자 이상이어야 합니다" }); return; }
    if (newPw !== confirmPw) { setPwMsg({ type: "error", text: "새 비밀번호가 일치하지 않습니다" }); return; }
    setChangingPw(true);
    try {
      const res = await fetch("/api/admin/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: currentPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (data.error) { setPwMsg({ type: "error", text: data.error }); }
      else { setPwMsg({ type: "success", text: "비밀번호가 변경되었습니다" }); setStoredPassword(newPw); setCurrentPw(""); setNewPw(""); setConfirmPw(""); }
    } catch { setPwMsg({ type: "error", text: "오류가 발생했습니다" }); }
    setChangingPw(false);
  }

  async function fetchAdminEmails() {
    try {
      const res = await fetch(`/api/admin/admins?password=${encodeURIComponent(storedPassword)}`);
      const data = await res.json();
      if (data.emails) setAdminEmails(data.emails);
    } catch { /* ignore */ }
  }

  async function handleAddAdminEmail() {
    if (!newAdminEmail.trim() || !newAdminEmail.includes("@")) { setEmailMsg({ type: "error", text: "올바른 이메일을 입력해주세요" }); return; }
    try {
      const res = await fetch("/api/admin/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: storedPassword, email: newAdminEmail.trim() }),
      });
      const data = await res.json();
      if (data.error) { setEmailMsg({ type: "error", text: data.error }); }
      else { setEmailMsg({ type: "success", text: "관리자 이메일이 추가되었습니다" }); setNewAdminEmail(""); fetchAdminEmails(); }
    } catch { setEmailMsg({ type: "error", text: "오류가 발생했습니다" }); }
  }

  async function handleDeleteAdminEmail(email: string) {
    try {
      await fetch("/api/admin/admins", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: storedPassword, email }),
      });
      setAdminEmails((prev) => prev.filter((e) => e.email !== email));
      setDeleteEmailConfirm(null);
    } catch { /* ignore */ }
  }

  // 설정 탭 열릴 때 관리자 이메일 로드
  useEffect(() => {
    if (tab === "settings" && storedPassword) fetchAdminEmails();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, storedPassword]);

  const pendingReports = reports.filter((r) => !r.resolved);
  const resolvedReports = reports.filter((r) => r.resolved);
  const pendingInquiries = inquiries.filter((inq) => !inq.hidden);
  const resolvedInquiries = inquiries.filter((inq) => inq.hidden);
  const unrepliedInquiries = pendingInquiries.filter((inq) => !inq.reply);

  const selectedInq = inquiries.find((inq) => inq.id === selectedInquiry);

  // ===== 로딩 화면 =====
  if (authStep === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="text-center">
          <svg className="mx-auto mb-3 h-8 w-8 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
          <p className="text-sm text-zinc-400">인증 확인 중...</p>
        </div>
      </div>
    );
  }

  // ===== Google 로그인 화면 =====
  if (authStep === "google") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg dark:bg-zinc-900">
          <Link href="/" className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            돌아가기
          </Link>
          <h1 className="mb-1 text-lg font-bold text-zinc-900 dark:text-zinc-100">관리자 페이지</h1>
          <p className="mb-5 text-sm text-zinc-500 dark:text-zinc-400">관리자 계정으로 로그인해주세요.</p>
          {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
          <button onClick={handleGoogleLogin} disabled={loading}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-zinc-200 bg-white py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-750">
            <svg className="h-5 w-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            {loading ? "로그인 중..." : "Google 계정으로 로그인"}
          </button>
        </div>
      </div>
    );
  }

  // ===== 접근 차단 화면 =====
  if (authStep === "blocked") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-lg dark:bg-zinc-900">
          <svg className="mx-auto mb-3 h-12 w-12 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
          <h1 className="mb-1 text-lg font-bold text-zinc-900 dark:text-zinc-100">접근 권한이 없습니다</h1>
          <p className="mb-2 text-sm text-zinc-500 dark:text-zinc-400">이 이메일은 관리자로 등록되어 있지 않습니다.</p>
          <p className="mb-5 text-xs text-zinc-400">{firebaseUser?.email}</p>
          <button onClick={handleGoogleLogout} className="w-full rounded-xl border border-zinc-200 py-3 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
            다른 계정으로 로그인
          </button>
        </div>
      </div>
    );
  }

  // ===== 비밀번호 입력 화면 =====
  if (authStep === "password") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg dark:bg-zinc-900">
          <Link href="/" className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            돌아가기
          </Link>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{firebaseUser?.displayName || "관리자"}</p>
              <p className="text-xs text-zinc-400">{firebaseUser?.email}</p>
            </div>
          </div>
          <h1 className="mb-1 text-lg font-bold text-zinc-900 dark:text-zinc-100">관리자 인증</h1>
          <p className="mb-5 text-sm text-zinc-500 dark:text-zinc-400">관리자 비밀번호를 입력해주세요.</p>
          <input
            type="password" value={password}
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            placeholder="관리자 비밀번호"
            className="mb-3 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-violet-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            onKeyDown={(e) => { if (e.key === "Enter") handleLogin(); }}
            autoFocus
          />
          {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
          <button onClick={handleLogin} disabled={loading} className="mb-3 w-full rounded-xl bg-violet-500 py-3 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-50">
            {loading ? "확인 중..." : "로그인"}
          </button>
          <button onClick={handleGoogleLogout} className="w-full text-center text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
            다른 계정으로 전환
          </button>
        </div>
      </div>
    );
  }

  // ===== 메인 대시보드 =====
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl lg:max-w-5xl">

        {/* Header */}
        <header className="flex items-center justify-between bg-white px-4 pb-3 pt-10 shadow-sm dark:bg-zinc-900">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </Link>
            <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-100">관리자 대시보드</h1>
          </div>
          <button onClick={handleRefresh} disabled={refreshing} className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">
            <svg className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            {refreshing ? "갱신 중..." : "새로고침"}
          </button>
        </header>

        {/* 요약 카드 */}
        <div className="grid grid-cols-2 gap-3 bg-white px-4 pb-4 pt-3 dark:bg-zinc-900 sm:grid-cols-4">
          <button onClick={() => setTab("pending")} className="rounded-xl border border-red-100 bg-red-50 p-3 text-left transition-colors hover:bg-red-100 dark:border-red-950 dark:bg-red-950/30 dark:hover:bg-red-950/50">
            <p className="text-xs font-medium text-red-500 dark:text-red-400">미처리 신고</p>
            <p className="mt-1 text-2xl font-bold text-red-600 dark:text-red-400">{pendingReports.length}</p>
          </button>
          <button onClick={() => setTab("inquiries")} className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-left transition-colors hover:bg-blue-100 dark:border-blue-950 dark:bg-blue-950/30 dark:hover:bg-blue-950/50">
            <p className="text-xs font-medium text-blue-500 dark:text-blue-400">미답변 문의</p>
            <p className="mt-1 text-2xl font-bold text-blue-600 dark:text-blue-400">{unrepliedInquiries.length}</p>
          </button>
          <button onClick={() => setTab("resolved")} className="rounded-xl border border-green-100 bg-green-50 p-3 text-left transition-colors hover:bg-green-100 dark:border-green-950 dark:bg-green-950/30 dark:hover:bg-green-950/50">
            <p className="text-xs font-medium text-green-500 dark:text-green-400">처리 완료</p>
            <p className="mt-1 text-2xl font-bold text-green-600 dark:text-green-400">{resolvedReports.length}</p>
          </button>
          <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-left dark:border-zinc-800 dark:bg-zinc-800/50">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">전체 신고</p>
            <p className="mt-1 text-2xl font-bold text-zinc-700 dark:text-zinc-300">{reports.length}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <button onClick={() => setTab("pending")} className={`flex-1 py-3 text-center text-sm font-semibold transition-colors ${tab === "pending" ? "border-b-2 border-red-500 text-red-600 dark:text-red-400" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"}`}>
            미처리 신고 <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600 dark:bg-red-950 dark:text-red-400">{pendingReports.length}</span>
          </button>
          <button onClick={() => setTab("resolved")} className={`flex-1 py-3 text-center text-sm font-semibold transition-colors ${tab === "resolved" ? "border-b-2 border-green-500 text-green-600 dark:text-green-400" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"}`}>
            처리완료 <span className="ml-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-600 dark:bg-green-950 dark:text-green-400">{resolvedReports.length + resolvedInquiries.length}</span>
          </button>
          <button onClick={() => setTab("inquiries")} className={`flex-1 py-3 text-center text-sm font-semibold transition-colors ${tab === "inquiries" ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"}`}>
            문의사항 <span className="ml-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-600 dark:bg-blue-950 dark:text-blue-400">{pendingInquiries.length}</span>
          </button>
          <button onClick={() => setTab("settings")} className={`flex-1 py-3 text-center text-sm font-semibold transition-colors ${tab === "settings" ? "border-b-2 border-zinc-500 text-zinc-700 dark:text-zinc-200" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"}`}>
            설정
          </button>
        </div>

        {/* ===== 미처리 신고 탭 ===== */}
        {tab === "pending" && (
          <div className="p-4">
            {pendingReports.length === 0 ? (
              <div className="rounded-2xl bg-white py-16 text-center dark:bg-zinc-900">
                <svg className="mx-auto mb-3 h-10 w-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">미처리 신고가 없습니다</p>
                <p className="mt-1 text-xs text-zinc-400">모든 신고가 처리되었습니다</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingReports.map((report) => (
                  <ReportCard key={report.id} report={report} onResolve={handleResolve} onDelete={(id) => setDeleteConfirmId(id)} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== 처리완료 탭 ===== */}
        {tab === "resolved" && (
          <div className="p-4">
            {/* 처리된 문의 */}
            {resolvedInquiries.length > 0 && (
              <div className="mb-5">
                <p className="mb-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">처리된 문의사항 ({resolvedInquiries.length})</p>
                <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                  {resolvedInquiries.map((inq, i) => (
                    <button key={inq.id} onClick={() => { setSelectedInquiry(selectedInquiry === inq.id ? null : inq.id); setReplyText(inq.reply || ""); }}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 ${i < resolvedInquiries.length - 1 ? "border-b border-zinc-100 dark:border-zinc-800" : ""}`}>
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-600 dark:bg-green-950 dark:text-green-400">완료</span>
                      {inq.reply && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-600 dark:bg-violet-950 dark:text-violet-400">답변됨</span>}
                      <span className="flex-1 truncate text-sm text-zinc-900 dark:text-zinc-100">{inq.title}</span>
                      <span className="shrink-0 text-xs text-zinc-400">{inq.author}</span>
                      <span className="shrink-0 text-xs text-zinc-400">{new Date(inq.created_at).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 처리된 신고 */}
            {resolvedReports.length > 0 && (
              <div>
                {resolvedInquiries.length > 0 && <p className="mb-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">처리된 신고 ({resolvedReports.length})</p>}
                <div className="space-y-3">
                  {resolvedReports.map((report) => (
                    <ReportCard key={report.id} report={report} />
                  ))}
                </div>
              </div>
            )}

            {resolvedReports.length === 0 && resolvedInquiries.length === 0 && (
              <div className="rounded-2xl bg-white py-16 text-center dark:bg-zinc-900">
                <p className="text-sm text-zinc-400">처리 완료된 항목이 없습니다.</p>
              </div>
            )}
          </div>
        )}

        {/* ===== 문의사항 탭 ===== */}
        {tab === "inquiries" && (
          <div className="p-4">
            {pendingInquiries.length === 0 ? (
              <div className="rounded-2xl bg-white py-16 text-center dark:bg-zinc-900">
                <svg className="mx-auto mb-3 h-10 w-10 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">등록된 문의가 없습니다</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingInquiries.map((inq) => (
                  <button key={inq.id} onClick={() => { setSelectedInquiry(selectedInquiry === inq.id ? null : inq.id); setReplyText(inq.reply || ""); }}
                    className={`w-full rounded-xl border bg-white p-4 text-left transition-colors hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800 ${!inq.reply ? "border-blue-200 dark:border-blue-900" : "border-zinc-200 dark:border-zinc-800"}`}>
                    <div className="flex items-center gap-2">
                      {!inq.reply ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:bg-amber-950 dark:text-amber-400">미답변</span>
                      ) : (
                        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-600 dark:bg-violet-950 dark:text-violet-400">답변됨</span>
                      )}
                      <span className="flex-1 truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{inq.title}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-zinc-400">
                      <span>{inq.author}</span>
                      {inq.email && <span>{inq.email}</span>}
                      <span>{new Date(inq.created_at).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" })}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== 설정 탭 ===== */}
        {tab === "settings" && (
          <div className="space-y-4 p-4">
            {/* 관리자 이메일 관리 */}
            <div className="rounded-2xl bg-white p-6 dark:bg-zinc-900">
              <h3 className="mb-1 text-base font-bold text-zinc-900 dark:text-zinc-100">관리자 계정 관리</h3>
              <p className="mb-5 text-sm text-zinc-500 dark:text-zinc-400">등록된 Google 이메일만 이 페이지에 접근할 수 있습니다.</p>

              {/* 현재 등록된 이메일 목록 */}
              {adminEmails.length > 0 && (
                <div className="mb-4 space-y-2">
                  {adminEmails.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-xl bg-zinc-50 px-4 py-3 dark:bg-zinc-800">
                      <div>
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{item.email}</p>
                        <p className="text-xs text-zinc-400">등록일: {new Date(item.created_at).toLocaleDateString("ko-KR")}</p>
                      </div>
                      {deleteEmailConfirm === item.email ? (
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleDeleteAdminEmail(item.email)} className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600">삭제</button>
                          <button onClick={() => setDeleteEmailConfirm(null)} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400">취소</button>
                        </div>
                      ) : (
                        <button onClick={() => setDeleteEmailConfirm(item.email)} className="text-xs text-red-400 hover:text-red-600">삭제</button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {adminEmails.length === 0 && (
                <div className="mb-4 rounded-xl bg-amber-50 px-4 py-3 dark:bg-amber-950/30">
                  <p className="text-sm text-amber-600 dark:text-amber-400">등록된 관리자 이메일이 없습니다. 이메일을 등록하지 않으면 Google 로그인 없이 비밀번호만으로 접근합니다.</p>
                </div>
              )}

              {/* 이메일 추가 */}
              <div className="flex gap-2">
                <input type="email" value={newAdminEmail} onChange={(e) => { setNewAdminEmail(e.target.value); setEmailMsg(null); }} placeholder="Google 이메일 주소 입력"
                  className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-violet-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddAdminEmail(); }} />
                <button onClick={handleAddAdminEmail} className="shrink-0 rounded-xl bg-violet-500 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-600">추가</button>
              </div>
              {emailMsg && <p className={`mt-2 text-sm ${emailMsg.type === "error" ? "text-red-500" : "text-green-500"}`}>{emailMsg.text}</p>}
            </div>

            {/* 비밀번호 변경 */}
            <div className="rounded-2xl bg-white p-6 dark:bg-zinc-900">
              <h3 className="mb-1 text-base font-bold text-zinc-900 dark:text-zinc-100">비밀번호 변경</h3>
              <p className="mb-5 text-sm text-zinc-500 dark:text-zinc-400">관리자 비밀번호를 변경합니다.</p>
              <div className="space-y-3">
                <input type="password" value={currentPw} onChange={(e) => { setCurrentPw(e.target.value); setPwMsg(null); }} placeholder="현재 비밀번호"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-violet-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
                <input type="password" value={newPw} onChange={(e) => { setNewPw(e.target.value); setPwMsg(null); }} placeholder="새 비밀번호 (4자 이상)"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-violet-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
                <input type="password" value={confirmPw} onChange={(e) => { setConfirmPw(e.target.value); setPwMsg(null); }} placeholder="새 비밀번호 확인"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-violet-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  onKeyDown={(e) => { if (e.key === "Enter") handleChangePassword(); }} />
                {pwMsg && <p className={`text-sm ${pwMsg.type === "error" ? "text-red-500" : "text-green-500"}`}>{pwMsg.text}</p>}
                <button onClick={handleChangePassword} disabled={changingPw}
                  className="w-full rounded-xl bg-violet-500 py-3 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-50">
                  {changingPw ? "변경 중..." : "비밀번호 변경"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== 문의 상세 모달 ===== */}
      {selectedInq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={(e) => { if (e.target === e.currentTarget) setSelectedInquiry(null); }}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            {/* 헤더 */}
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">문의 상세</h3>
                {selectedInq.reply ? (
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-600 dark:bg-violet-950 dark:text-violet-400">답변됨</span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:bg-amber-950 dark:text-amber-400">미답변</span>
                )}
              </div>
              <button onClick={() => setSelectedInquiry(null)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
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
              <div className="flex border-b border-zinc-100 pb-2 dark:border-zinc-800">
                <span className="w-16 shrink-0 text-sm font-medium text-zinc-500 dark:text-zinc-400">날짜</span>
                <span className="text-sm text-zinc-900 dark:text-zinc-100">{new Date(selectedInq.created_at).toLocaleString("ko-KR")}</span>
              </div>
              <div>
                <span className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">문의 내용</span>
                <div className="rounded-xl bg-zinc-50 px-4 py-3 dark:bg-zinc-800">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{selectedInq.content}</p>
                </div>
              </div>

              {/* 기존 답변 표시 */}
              {selectedInq.reply && (
                <div>
                  <span className="mb-1 flex items-center gap-2 text-sm font-medium text-violet-600 dark:text-violet-400">
                    관리자 답변
                    {selectedInq.replied_at && <span className="text-xs font-normal text-zinc-400">{new Date(selectedInq.replied_at).toLocaleString("ko-KR")}</span>}
                  </span>
                  <div className="rounded-xl bg-violet-50 px-4 py-3 dark:bg-violet-950/30">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-violet-700 dark:text-violet-300">{selectedInq.reply}</p>
                  </div>
                </div>
              )}

              {/* 답변 입력 */}
              <div>
                <span className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">
                  {selectedInq.reply ? "답변 수정" : "답변 작성"}
                </span>
                <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={4} placeholder="답변 내용을 입력하세요..."
                  className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-violet-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
                <button onClick={() => handleReply(selectedInq.id)} disabled={replying || !replyText.trim()}
                  className="mt-2 w-full rounded-xl bg-violet-500 py-2.5 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-50">
                  {replying ? "전송 중..." : selectedInq.reply ? "답변 수정" : "답변 전송"}
                </button>
              </div>
            </div>

            {/* 하단 버튼 */}
            <div className="mt-5 flex justify-end gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
              <button onClick={() => setDeleteInquiryId(selectedInq.id)} className="rounded-lg bg-red-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-600">삭제</button>
              {selectedInq.hidden ? (
                <button onClick={() => handleUnhideInquiry(selectedInq.id)} className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600">숨김 해제</button>
              ) : (
                <button onClick={() => handleResolveInquiry(selectedInq.id)} className="rounded-lg bg-green-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-600">처리완료</button>
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
              신고된 {reports.find((r) => r.id === deleteConfirmId)?.target_type === "post" ? "게시글" : "댓글"}을 삭제하고 처리 완료로 이동합니다.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setDeleteConfirmId(null)} disabled={deleting} className="rounded-lg border border-zinc-200 px-5 py-2.5 text-sm font-semibold text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">아니오</button>
              <button onClick={() => handleDelete(deleteConfirmId)} disabled={deleting} className="rounded-lg bg-red-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50">{deleting ? "삭제 중..." : "예"}</button>
            </div>
          </div>
        </div>
      )}

      {/* 문의 삭제 확인 모달 */}
      {deleteInquiryId !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">문의를 삭제하시겠습니까?</h3>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">삭제된 문의는 복구할 수 없습니다.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setDeleteInquiryId(null)} disabled={deleting} className="rounded-lg border border-zinc-200 px-5 py-2.5 text-sm font-semibold text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">아니오</button>
              <button onClick={() => handleDeleteInquiry(deleteInquiryId)} disabled={deleting} className="rounded-lg bg-red-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50">{deleting ? "삭제 중..." : "예"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== 신고 카드 컴포넌트 =====
function ReportCard({ report, onResolve, onDelete }: { report: Report; onResolve?: (id: number) => void; onDelete?: (id: number) => void }) {
  return (
    <div className={`rounded-2xl border bg-white p-4 dark:bg-zinc-900 ${report.resolved ? "border-green-200 dark:border-green-900" : "border-zinc-200 dark:border-zinc-800"}`}>
      {/* 상단 */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${report.target_type === "post" ? "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-400" : "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"}`}>
            {report.target_type === "post" ? "게시글" : "댓글"}
          </span>
          {report.category_name && <span className="text-xs text-zinc-400">{report.category_name}</span>}
          {report.resolved && report.deleted_at && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600 dark:bg-red-950 dark:text-red-400">삭제됨</span>}
          {report.resolved && !report.deleted_at && <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-600 dark:bg-green-950 dark:text-green-400">처리됨</span>}
        </div>
        <span className="text-xs text-zinc-400">{new Date(report.created_at).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
      </div>

      {/* 신고 대상 */}
      <div className="mb-3 rounded-xl bg-zinc-50 px-4 py-3 dark:bg-zinc-800">
        {report.target_type === "post" ? (
          <>
            <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">신고된 게시글</p>
            <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{report.post_title || "(삭제된 게시글)"}</p>
            <p className="mt-0.5 text-xs text-zinc-400">작성자: {report.post_author || "-"}</p>
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

      {/* 신고 사유 */}
      <div className="mb-3 rounded-xl bg-red-50 px-4 py-3 dark:bg-red-950/30">
        <p className="text-xs font-semibold text-red-600 dark:text-red-400">신고 사유</p>
        <p className="mt-1 text-sm text-red-700 dark:text-red-300">{report.reason}</p>
        {report.custom_reason && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{report.custom_reason}</p>}
      </div>

      {/* 삭제 기록 */}
      {report.deleted_at && (
        <div className="mb-3 rounded-xl bg-zinc-100 px-4 py-3 dark:bg-zinc-800">
          <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">삭제 기록</p>
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">관리자에 의해 {report.target_type === "post" ? "게시글이" : "댓글이"} 삭제되었습니다.</p>
          <p className="mt-0.5 text-xs text-zinc-400">삭제 시각: {new Date(report.deleted_at).toLocaleString("ko-KR")}</p>
        </div>
      )}

      {/* 버튼 */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {!report.resolved && onDelete && (
          <button onClick={() => onDelete(report.id)} className="rounded-lg bg-red-500 px-4 py-2 text-xs font-semibold text-white hover:bg-red-600">삭제하기</button>
        )}
        <Link href={`/category/${report.category_id}/post/${report.post_id}`} className="rounded-lg bg-violet-500 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-600">바로가기</Link>
        {!report.resolved && onResolve && (
          <button onClick={() => onResolve(report.id)} className="rounded-lg border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">처리 완료</button>
        )}
      </div>
    </div>
  );
}
