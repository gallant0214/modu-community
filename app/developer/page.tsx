"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { signInWithPopup, onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth, googleProvider } from "@/app/lib/firebase-client";
import { getReports, resolveReport, deleteReportTarget, getInquiries, hideInquiry, unhideInquiry, deleteInquiry, replyToInquiry } from "@/app/lib/actions";
import type { Report, Inquiry } from "@/app/lib/types";
import { ANALYTICS_EXCLUDE_KEY } from "@/app/lib/use-tab-analytics";

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
  const [tab, setTab] = useState<"report" | "pending" | "resolved" | "inquiries" | "notice" | "push" | "settings" | "kpi" | "user">("report");

  // USER 탭 — 닉네임 조회 상태
  const [userQuery, setUserQuery] = useState("");
  const [userResult, setUserResult] = useState<any>(null);
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState<string>("");
  // USER 탭 — 전체 유저 리스트 + 페이지네이션 (30명/페이지)
  const [userListPage, setUserListPage] = useState(1);
  const [userListData, setUserListData] = useState<{
    users: any[]; total: number; page: number; limit: number; totalPages: number;
  } | null>(null);
  const [userListLoading, setUserListLoading] = useState(false);
  const [userListError, setUserListError] = useState<string>("");
  const loadUserList = useCallback(async (page: number) => {
    if (!storedPassword) return;
    setUserListLoading(true);
    setUserListError("");
    try {
      const res = await fetch("/api/admin/users/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: storedPassword, page, limit: 30 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUserListError(data?.error || "조회 실패");
        setUserListData(null);
      } else {
        setUserListData(data);
      }
    } catch (e: any) {
      setUserListError(e?.message || "네트워크 오류");
    } finally {
      setUserListLoading(false);
    }
  }, [storedPassword]);
  // USER 탭 진입 시 첫 페이지 자동 로드 (캐시 없을 때만)
  useEffect(() => {
    if (tab === "user" && storedPassword && !userListData && !userListLoading) {
      loadUserList(userListPage);
    }
  }, [tab, storedPassword, userListData, userListLoading, userListPage, loadUserList]);
  const lookupUser = async () => {
    if (!storedPassword) return;
    const q = userQuery.trim();
    if (!q) { setUserError("닉네임을 입력하세요"); return; }
    setUserLoading(true);
    setUserError("");
    setUserResult(null);
    try {
      const res = await fetch("/api/admin/users/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: storedPassword, nickname: q }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUserError(data?.error || "조회 실패");
      } else {
        setUserResult(data);
      }
    } catch (e: any) {
      setUserError(e?.message || "네트워크 오류");
    } finally {
      setUserLoading(false);
    }
  };
  const [kpiData, setKpiData] = useState<any>(null);
  const [kpiLoading, setKpiLoading] = useState(false);
  // 탭 방문 통계 (tab_visits 집계)
  const [tabStatsData, setTabStatsData] = useState<any>(null);
  const [tabStatsLoading, setTabStatsLoading] = useState(false);
  // 추적 제외 토글 — 본인 트래픽 제거
  const [analyticsExcluded, setAnalyticsExcluded] = useState(false);
  // USER 탭 쪽지 펼침 — 법적 분쟁 대응 목적, 기본 접힘
  const [userMessagesExpanded, setUserMessagesExpanded] = useState(false);
  // 리포트 탭 상태
  const [reportData, setReportData] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportPeriod, setReportPeriod] = useState<"day" | "week" | "month" | "custom">("week");
  const [reportOffset, setReportOffset] = useState<number>(0);
  const [reportCustomFrom, setReportCustomFrom] = useState<string>("");
  const [reportCustomTo, setReportCustomTo] = useState<string>("");
  const [kpiRange, setKpiRange] = useState<"all" | "day" | "week" | "month" | "custom">("all");
  const [kpiFrom, setKpiFrom] = useState<string>("");
  const [kpiTo, setKpiTo] = useState<string>("");
  // 유입수 + 시간·요일별 전용 기간 — 기본 '주', custom 지원
  const [kpiVisitRange, setKpiVisitRange] = useState<"all" | "day" | "week" | "month" | "custom">("week");
  const [kpiVisitFrom, setKpiVisitFrom] = useState<string>("");
  const [kpiVisitTo, setKpiVisitTo] = useState<string>("");
  // 신고 분석 전용 기간 — 기본 '주', custom 지원
  const [kpiReportRange, setKpiReportRange] = useState<"all" | "day" | "week" | "month" | "custom">("week");
  const [kpiReportFrom, setKpiReportFrom] = useState<string>("");
  const [kpiReportTo, setKpiReportTo] = useState<string>("");
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

  // 공지 관리 상태
  const [notice, setNotice] = useState<{ id: number; title: string; content: string; category_id: number; created_at: string; updated_at: string } | null>(null);
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeContent, setNoticeContent] = useState("");
  const [noticeLoading, setNoticeLoading] = useState(false);
  const [noticeMsg, setNoticeMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [noticeMode, setNoticeMode] = useState<"view" | "edit" | "create">("view");

  // 푸시 알림 상태
  const [pushTitle, setPushTitle] = useState("");
  const [pushBody, setPushBody] = useState("");
  const [pushUrl, setPushUrl] = useState("");
  const [pushType, setPushType] = useState<"notice" | "event" | "ad">("notice");
  const [pushSending, setPushSending] = useState(false);
  const [pushMsg, setPushMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [pushLogs, setPushLogs] = useState<{ id: number; title: string; body: string; data: string; created_at: string }[]>([]);
  const [pushConfirm, setPushConfirm] = useState(false);
  const [pushHistory, setPushHistory] = useState<any[]>([]);

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

  // KPI 기간 필터 → from/to ISO string 계산
  // 리포트 라우트(getAutoRange)와 동일하게 캘린더 일자 기준 (오늘 + 지난 N-1일)
  // mode 가 custom 일 때 customFrom/customTo 둘 다 받아서 처리 (메인/방문자 각각의 from/to 사용)
  const computeRange = useCallback((
    mode: "all" | "day" | "week" | "month" | "custom",
    customFrom?: string,
    customTo?: string,
  ): { from?: string; to?: string } => {
    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
    if (mode === "all") return {};
    if (mode === "day") return { from: startOfDay.toISOString(), to: now.toISOString() };
    if (mode === "week") {
      const d = new Date(startOfDay); d.setDate(d.getDate() - 6);
      return { from: d.toISOString(), to: now.toISOString() };
    }
    if (mode === "month") {
      const d = new Date(startOfDay); d.setDate(d.getDate() - 29);
      return { from: d.toISOString(), to: now.toISOString() };
    }
    // custom
    return {
      from: customFrom ? new Date(customFrom + "T00:00:00").toISOString() : undefined,
      to: customTo ? new Date(customTo + "T23:59:59").toISOString() : undefined,
    };
  }, []);

  // 리포트 데이터 로드
  const loadReport = useCallback(async (
    period: "day" | "week" | "month" | "custom",
    offset: number,
    customFrom?: string,
    customTo?: string,
  ) => {
    setReportLoading(true);
    try {
      const res = await fetch("/api/admin/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: storedPassword,
          period,
          offset,
          ...(period === "custom" ? { customFrom, customTo } : {}),
        }),
      });
      const data = await res.json();
      if (!data.error) setReportData(data);
    } catch {}
    setReportLoading(false);
  }, [storedPassword]);

  const loadKpi = useCallback(async (
    mainMode: typeof kpiRange,
    visitMode: typeof kpiVisitRange,
    reportMode: typeof kpiReportRange,
  ) => {
    setKpiLoading(true);
    try {
      const main = computeRange(mainMode, kpiFrom, kpiTo);
      const visit = computeRange(visitMode, kpiVisitFrom, kpiVisitTo);
      const report = computeRange(reportMode, kpiReportFrom, kpiReportTo);
      const res = await fetch("/api/admin/kpi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: storedPassword,
          ...main,
          visitFrom: visit.from,
          visitTo: visit.to,
          reportFrom: report.from,
          reportTo: report.to,
        }),
      });
      const data = await res.json();
      if (!data.error) setKpiData(data);
    } catch {}
    setKpiLoading(false);
  }, [storedPassword, computeRange, kpiFrom, kpiTo, kpiVisitFrom, kpiVisitTo, kpiReportFrom, kpiReportTo]);

  // 탭 방문 통계 — 유입수 기간(kpiVisit*) 그대로 사용
  const loadTabStats = useCallback(async (visitMode: typeof kpiVisitRange) => {
    if (!storedPassword) return;
    setTabStatsLoading(true);
    try {
      const visit = computeRange(visitMode, kpiVisitFrom, kpiVisitTo);
      // "all" 의 경우 from/to 없으면 광범위 기본값 적용 (90일)
      const today = new Date().toISOString().slice(0, 10);
      const fallbackFrom = (() => {
        const d = new Date();
        d.setDate(d.getDate() - 89);
        return d.toISOString().slice(0, 10);
      })();
      const res = await fetch("/api/admin/kpi/tab-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: storedPassword,
          from: visit.from || fallbackFrom,
          to: visit.to || today,
        }),
      });
      const data = await res.json();
      if (!data.error) setTabStatsData(data);
    } catch {}
    setTabStatsLoading(false);
  }, [storedPassword, computeRange, kpiVisitFrom, kpiVisitTo]);

  function formatTabDuration(sec: number): string {
    if (!sec || sec <= 0) return "-";
    if (sec < 60) return `${sec}초`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m < 60) return s > 0 ? `${m}분 ${s}초` : `${m}분`;
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return remM > 0 ? `${h}시간 ${remM}분` : `${h}시간`;
  }

  function toggleAnalyticsExclusion() {
    if (typeof window === "undefined") return;
    const next = !analyticsExcluded;
    if (next) localStorage.setItem(ANALYTICS_EXCLUDE_KEY, "true");
    else localStorage.removeItem(ANALYTICS_EXCLUDE_KEY);
    setAnalyticsExcluded(next);
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
    if (tab === "kpi") {
      await loadKpi(kpiRange, kpiVisitRange, kpiReportRange);
    } else if (tab === "report") {
      await loadReport(reportPeriod, reportOffset, reportCustomFrom, reportCustomTo);
    } else {
      await fetchData(storedPassword);
    }
    setRefreshing(false);
  }

  // 인증 직후 리포트 탭이 기본이라 첫 데이터 로드
  useEffect(() => {
    if (authStep === "authenticated" && storedPassword && tab === "report" && !reportData) {
      loadReport(reportPeriod, reportOffset, reportCustomFrom, reportCustomTo);
    }
  }, [authStep, storedPassword, tab, reportData, reportPeriod, reportOffset, loadReport]);

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

  async function fetchPushLogs() {
    try {
      const token = await firebaseUser?.getIdToken();
      const res = await fetch("/api/admin/broadcast", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.broadcasts) setPushHistory(data.broadcasts);
    } catch { /* ignore */ }
  }

  async function handleSendPush() {
    if (!pushTitle.trim() || !pushBody.trim()) { setPushMsg({ type: "error", text: "제목과 내용을 입력해주세요" }); return; }
    setPushSending(true);
    setPushMsg(null);
    try {
      const token = await firebaseUser?.getIdToken();
      // 광고/프로모션 발송은 정보통신망법 제50조에 따라 제목에 (광고) 자동 부착
      const finalTitle = pushType === "ad"
        ? `(광고) ${pushTitle.trim().replace(/^\(광고\)\s*/u, "")}`
        : pushTitle.trim();
      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ title: finalTitle, body: pushBody.trim(), broadcast_type: pushType || "notice" }),
      });
      const data = await res.json();
      if (data.error) { setPushMsg({ type: "error", text: data.error }); }
      else {
        const failText = data.failCount > 0 ? ` · 실패 ${data.failCount}건` : "";
        setPushMsg({ type: "success", text: `전송 완료! 대상 ${data.totalTargets || data.sentCount}명 · 성공 ${data.sentCount}건${failText}` });
        setPushTitle("");
        setPushBody("");
        setPushUrl("");
        setPushConfirm(false);
        fetchPushLogs();
      }
    } catch { setPushMsg({ type: "error", text: "전송 중 오류가 발생했습니다" }); }
    setPushSending(false);
  }

  useEffect(() => {
    if (tab === "push" && storedPassword) fetchPushLogs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, storedPassword]);

  async function fetchNotice() {
    try {
      const res = await fetch("/api/posts/notice");
      const data = await res.json();
      if (data && data.id) {
        setNotice(data);
        setNoticeTitle(data.title);
        setNoticeContent(data.content);
        setNoticeMode("view");
      } else {
        setNotice(null);
        setNoticeTitle("");
        setNoticeContent("");
        setNoticeMode("create");
      }
    } catch { setNotice(null); setNoticeMode("create"); }
  }

  async function handleSaveNotice() {
    if (!noticeTitle.trim() || !noticeContent.trim()) { setNoticeMsg({ type: "error", text: "제목과 내용을 입력해주세요" }); return; }
    setNoticeLoading(true);
    setNoticeMsg(null);
    try {
      if (notice && noticeMode === "edit") {
        // 수정
        const token = await firebaseUser?.getIdToken();
        const res = await fetch(`/api/admin/notices/${notice.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ password: storedPassword, title: noticeTitle.trim(), content: noticeContent.trim() }),
        });
        const data = await res.json();
        if (data.error) { setNoticeMsg({ type: "error", text: data.error }); }
        else {
          setNoticeMsg({ type: "success", text: "공지가 수정되었습니다" });
          setNotice({ ...notice, title: noticeTitle.trim(), content: noticeContent.trim(), updated_at: new Date().toISOString() });
          setNoticeMode("view");
        }
      } else {
        // 새 공지 생성
        const token = await firebaseUser?.getIdToken();
        const res = await fetch("/api/admin/notices", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ password: storedPassword, title: noticeTitle.trim(), content: noticeContent.trim() }),
        });
        const data = await res.json();
        if (data.error) { setNoticeMsg({ type: "error", text: data.error }); }
        else {
          setNoticeMsg({ type: "success", text: "공지가 등록되었습니다" });
          fetchNotice();
        }
      }
    } catch { setNoticeMsg({ type: "error", text: "오류가 발생했습니다" }); }
    setNoticeLoading(false);
  }

  // 공지 탭 열릴 때 로드
  useEffect(() => {
    if (tab === "notice" && storedPassword) fetchNotice();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, storedPassword]);

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
        <div className="flex items-center border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 overflow-x-auto">
          <button onClick={async () => {
            setTab("report");
            if (!reportData && reportPeriod !== "custom") await loadReport(reportPeriod, reportOffset);
          }} className={`flex-1 min-w-[80px] py-3 text-center text-sm font-semibold transition-colors ${tab === "report" ? "border-b-2 border-emerald-500 text-emerald-600 dark:text-emerald-400" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"}`}>
            리포트
          </button>
          <button onClick={() => setTab("pending")} className={`flex-1 min-w-[80px] py-3 text-center text-sm font-semibold transition-colors ${tab === "pending" ? "border-b-2 border-red-500 text-red-600 dark:text-red-400" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"}`}>
            미처리 신고 <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600 dark:bg-red-950 dark:text-red-400">{pendingReports.length}</span>
          </button>
          <button onClick={() => setTab("resolved")} className={`flex-1 py-3 text-center text-sm font-semibold transition-colors ${tab === "resolved" ? "border-b-2 border-green-500 text-green-600 dark:text-green-400" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"}`}>
            처리완료 <span className="ml-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-600 dark:bg-green-950 dark:text-green-400">{resolvedReports.length + resolvedInquiries.length}</span>
          </button>
          <button onClick={() => setTab("inquiries")} className={`flex-1 py-3 text-center text-sm font-semibold transition-colors ${tab === "inquiries" ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"}`}>
            문의사항 <span className="ml-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-600 dark:bg-blue-950 dark:text-blue-400">{pendingInquiries.length}</span>
          </button>
          <button onClick={() => setTab("notice")} className={`flex-1 py-3 text-center text-sm font-semibold transition-colors ${tab === "notice" ? "border-b-2 border-amber-500 text-amber-600 dark:text-amber-400" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"}`}>
            공지
          </button>
          <button onClick={() => setTab("push")} className={`flex-1 py-3 text-center text-sm font-semibold transition-colors ${tab === "push" ? "border-b-2 border-violet-500 text-violet-600 dark:text-violet-400" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"}`}>
            푸시
          </button>
          <button onClick={() => setTab("settings")} className={`flex-1 py-3 text-center text-sm font-semibold transition-colors ${tab === "settings" ? "border-b-2 border-zinc-500 text-zinc-700 dark:text-zinc-200" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"}`}>
            설정
          </button>
          <button onClick={async () => {
            setTab("kpi");
            if (!kpiData) await loadKpi(kpiRange, kpiVisitRange, kpiReportRange);
            if (!tabStatsData) await loadTabStats(kpiVisitRange);
            if (typeof window !== "undefined") {
              setAnalyticsExcluded(localStorage.getItem(ANALYTICS_EXCLUDE_KEY) === "true");
            }
          }} className={`flex-1 py-3 text-center text-sm font-semibold transition-colors ${tab === "kpi" ? "border-b-2 border-emerald-500 text-emerald-600 dark:text-emerald-400" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"}`}>
            KPI
          </button>
          <button onClick={() => setTab("user")} className={`flex-1 py-3 text-center text-sm font-semibold transition-colors ${tab === "user" ? "border-b-2 border-cyan-500 text-cyan-600 dark:text-cyan-400" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"}`}>
            USER
          </button>
        </div>

        {/* ===== KPI 대시보드 탭 ===== */}
        {tab === "kpi" && (
          <div className="p-4">
            {kpiLoading ? (
              <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : kpiData ? (
              <div className="space-y-6">
                {/* ╔══════ 유입 분석 박스 (셀렉터 + 유입수 + 시간·요일별 + 채널 통합) ══════╗ */}
                <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 p-4 space-y-4">
                  <div>
                    <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-2">
                      유입수 · 시간·요일별 · 유입 채널 기간 필터 (기본: 주)
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {[
                        { key: "week", label: "주" },
                        { key: "month", label: "월" },
                        { key: "day", label: "일" },
                        { key: "all", label: "전체" },
                        { key: "custom", label: "직접선택" },
                      ].map(({ key, label }) => (
                        <button
                          key={key}
                          onClick={() => {
                            const next = key as typeof kpiVisitRange;
                            setKpiVisitRange(next);
                            if (next !== "custom") loadKpi(kpiRange, next, kpiReportRange);
                          }}
                          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                            kpiVisitRange === key
                              ? "bg-emerald-500 text-white shadow-sm"
                              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                          }`}
                        >{label}</button>
                      ))}
                    </div>
                    {kpiVisitRange === "custom" && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <input type="date" value={kpiVisitFrom} onChange={(e) => setKpiVisitFrom(e.target.value)}
                          className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm" />
                        <span className="text-sm text-zinc-400">~</span>
                        <input type="date" value={kpiVisitTo} onChange={(e) => setKpiVisitTo(e.target.value)}
                          className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm" />
                        <button onClick={() => loadKpi(kpiRange, "custom", kpiReportRange)}
                          disabled={!kpiVisitFrom || !kpiVisitTo}
                          className="px-4 py-1.5 rounded-lg bg-emerald-500 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed">조회</button>
                      </div>
                    )}
                  </div>
                  <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <VisitDailyChart daily={kpiData.visits?.dailyChart || []} total={kpiData.visits?.inRange ?? 0} />
                      <VisitHourlyChart hourly={kpiData.visits?.hourlyChart || []} weekday={kpiData.visits?.weekdayChart || []} />
                    </div>
                  </div>
                  <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4">
                    <VisitChannels channels={kpiData.visits?.channels || []} />
                  </div>
                </div>

                {/* ╔══════ 신고 분석 박스 (셀렉터 + 카테고리별 카운트 + 파이차트) ══════╗ */}
                <ReportAnalysisBox
                  range={kpiReportRange}
                  setRange={setKpiReportRange}
                  from={kpiReportFrom}
                  setFrom={setKpiReportFrom}
                  to={kpiReportTo}
                  setTo={setKpiReportTo}
                  onApply={(mode) => loadKpi(kpiRange, kpiVisitRange, mode)}
                  data={kpiData.reportAnalysis}
                />

                {/* ╔══════ 메인 분석 박스 (셀렉터 + 사용자/콘텐츠/구인/참여/신고문의/스토어/인기) ══════╗ */}
                <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 p-4 space-y-6">
                  <div>
                    <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-2">
                      아래 항목 (사용자 · 콘텐츠 · 구인 · 참여 · 신고/문의 · 스토어 클릭) 기간 필터
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {[
                        { key: "day", label: "일" },
                        { key: "week", label: "주" },
                        { key: "month", label: "월" },
                        { key: "all", label: "전체" },
                        { key: "custom", label: "기간 설정" },
                      ].map(({ key, label }) => (
                        <button
                          key={key}
                          onClick={() => {
                            const next = key as typeof kpiRange;
                            setKpiRange(next);
                            if (next !== "custom") loadKpi(next, kpiVisitRange, kpiReportRange);
                          }}
                          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                            kpiRange === key
                              ? "bg-emerald-500 text-white shadow-sm"
                              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                          }`}
                        >{label}</button>
                      ))}
                    </div>
                    {kpiRange === "custom" && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <input type="date" value={kpiFrom} onChange={(e) => setKpiFrom(e.target.value)}
                          className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm" />
                        <span className="text-sm text-zinc-400">~</span>
                        <input type="date" value={kpiTo} onChange={(e) => setKpiTo(e.target.value)}
                          className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm" />
                        <button onClick={() => loadKpi("custom", kpiVisitRange, kpiReportRange)}
                          disabled={!kpiFrom || !kpiTo}
                          className="px-4 py-1.5 rounded-lg bg-emerald-500 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed">조회</button>
                      </div>
                    )}
                  </div>

                  <KpiSubsection title="사용자">
                    <KpiCard label="전체 가입자" value={kpiData.users?.total ?? 0} />
                    <KpiCard label="기간 신규 가입" value={kpiData.users?.inRange ?? 0} accent />
                    <KpiCard label="기간 글 작성자" value={kpiData.engagement?.activePostersInRange ?? 0} />
                    <KpiCard label="기간 댓글 작성자" value={kpiData.engagement?.activeCommentersInRange ?? 0} />
                  </KpiSubsection>

                  <KpiSubsection title="콘텐츠">
                    <KpiCard label="전체 게시글" value={kpiData.posts?.total ?? 0} />
                    <KpiCard label="기간 게시글" value={kpiData.posts?.inRange ?? 0} accent />
                    <KpiCard label="전체 댓글" value={kpiData.comments?.total ?? 0} />
                    <KpiCard label="기간 댓글" value={kpiData.comments?.inRange ?? 0} accent />
                  </KpiSubsection>

                  <KpiSubsection title="구인">
                    <KpiCard label="전체 구인글" value={kpiData.jobs?.total ?? 0} />
                    <KpiCard label="기간 등록" value={kpiData.jobs?.inRange ?? 0} accent />
                    <KpiCard label="모집중 (기간)" value={kpiData.jobs?.open ?? 0} />
                    <KpiCard label="모집종료 (기간)" value={kpiData.jobs?.closed ?? 0} />
                  </KpiSubsection>

                  <KpiSubsection title="거래">
                    <KpiCard label="전체 거래글" value={kpiData.trades?.total ?? 0} />
                    <KpiCard label="기간 등록" value={kpiData.trades?.inRange ?? 0} accent />
                    <KpiCard label="중고거래 (전체)" value={kpiData.trades?.equipmentTotal ?? 0} />
                    <KpiCard label="센터매매 (전체)" value={kpiData.trades?.centerTotal ?? 0} />
                    <KpiCard label="중고거래 (기간)" value={kpiData.trades?.equipmentInRange ?? 0} />
                    <KpiCard label="센터매매 (기간)" value={kpiData.trades?.centerInRange ?? 0} />
                    <KpiCard label="거래 북마크 (전체)" value={kpiData.trades?.bookmarksTotal ?? 0} />
                    <KpiCard label="거래 북마크 (기간)" value={kpiData.trades?.bookmarksInRange ?? 0} />
                  </KpiSubsection>

                  <KpiSubsection title="참여 (기간)">
                    <KpiCard label="게시글 좋아요" value={kpiData.engagement?.postLikesInRange ?? 0} />
                    <KpiCard label="댓글 좋아요" value={kpiData.engagement?.commentLikesInRange ?? 0} />
                    <KpiCard label="게시글 북마크" value={kpiData.engagement?.postBookmarksInRange ?? 0} />
                    <KpiCard label="구인 북마크" value={kpiData.engagement?.jobBookmarksInRange ?? 0} />
                    <KpiCard label="거래 북마크" value={kpiData.trades?.bookmarksInRange ?? 0} />
                  </KpiSubsection>

                  <KpiSubsection title="신고/문의">
                    <KpiCard label="미처리 신고" value={kpiData.reports?.pending ?? 0} warn />
                    <KpiCard label="기간 신고" value={kpiData.reports?.inRange ?? 0} />
                    <KpiCard label="미답변 문의" value={kpiData.inquiries?.pending ?? 0} warn />
                    <KpiCard label="기간 문의" value={kpiData.inquiries?.inRange ?? 0} />
                  </KpiSubsection>

                  <KpiSubsection title="스토어 클릭">
                    <KpiCard label="Google Play (전체)" value={kpiData.storeClicks?.googlePlayTotal ?? 0} />
                    <KpiCard label="App Store (전체)" value={kpiData.storeClicks?.appStoreTotal ?? 0} />
                    <KpiCard label="Google Play (기간)" value={kpiData.storeClicks?.googlePlayInRange ?? 0} accent />
                    <KpiCard label="App Store (기간)" value={kpiData.storeClicks?.appStoreInRange ?? 0} accent />
                  </KpiSubsection>

                  {kpiData.topCategories?.length > 0 && (
                    <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4">
                      <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-3">기간 인기 종목</h3>
                      {kpiData.topCategories.map((c: any, i: number) => (
                        <div key={c.name} className="flex items-center gap-2 py-1">
                          <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold flex items-center justify-center">{i+1}</span>
                          <span className="flex-1 text-sm text-zinc-800 dark:text-zinc-200">{c.name}</span>
                          <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{c.count}건</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {kpiData.topPosts?.length > 0 && (
                    <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4">
                      <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-3">기간 인기 게시글</h3>
                      {kpiData.topPosts.map((p: any, i: number) => (
                        <div key={p.id} className="flex items-center gap-2 py-1">
                          <span className="w-5 h-5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 text-[10px] font-bold flex items-center justify-center">{i+1}</span>
                          <span className="flex-1 text-sm text-zinc-800 dark:text-zinc-200 truncate">{p.title}</span>
                          <span className="shrink-0 text-[11px] text-zinc-400">조회{p.views} ♥{p.likes}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-center py-16 text-sm text-zinc-400">KPI 데이터를 불러올 수 없습니다.</p>
            )}

            {/* ===== 추적 제외 토글 ===== */}
            <div className="mt-4 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">이 브라우저 추적 제외</p>
                  <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                    켜면 본 브라우저의 탭 방문은 통계에 잡히지 않음. (개발 환경 localhost·127·192.168 은 자동 제외)
                  </p>
                </div>
                <button
                  onClick={toggleAnalyticsExclusion}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
                    analyticsExcluded
                      ? "bg-emerald-500 text-white hover:bg-emerald-600"
                      : "border border-zinc-300 bg-white text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                  }`}
                >
                  {analyticsExcluded ? "제외 중 (끄기)" : "제외 켜기"}
                </button>
              </div>
            </div>

            {/* ===== 탭 방문 통계 (tab_visits) ===== */}
            <div className="mt-4 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">탭 방문 통계</h3>
                <button
                  onClick={() => loadTabStats(kpiVisitRange)}
                  disabled={tabStatsLoading}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  {tabStatsLoading ? "조회 중..." : "새로고침"}
                </button>
              </div>
              {tabStatsData ? (
                <>
                  <p className="mb-3 text-[11px] text-zinc-400">
                    {tabStatsData.from} ~ {tabStatsData.to} · 총 {(tabStatsData.total_visits || 0).toLocaleString()}회 방문
                  </p>
                  {/* 탭별 카드 */}
                  <p className="mb-1.5 text-[11px] font-semibold text-zinc-400">탭별 (방문수 / 평균 체류)</p>
                  <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(["practical", "community", "jobs", "trade"] as const).map((t) => {
                      const s = tabStatsData.by_tab?.[t] || { visits: 0, avg_duration_sec: 0 };
                      const label = t === "practical" ? "실기·구술" : t === "community" ? "종목후기" : t === "jobs" ? "구인" : "거래";
                      return (
                        <div key={t} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800">
                          <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">{label}</p>
                          <p className="mt-1 text-lg font-bold text-zinc-900 dark:text-zinc-100">
                            {(s.visits || 0).toLocaleString()}
                            <span className="ml-1 text-[11px] font-medium text-zinc-400">회</span>
                          </p>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">평균 {formatTabDuration(s.avg_duration_sec)}</p>
                        </div>
                      );
                    })}
                  </div>
                  {/* 플랫폼별 카드 */}
                  <p className="mb-1.5 text-[11px] font-semibold text-zinc-400">플랫폼별</p>
                  <div className="mb-4 grid grid-cols-3 gap-2">
                    {(["web", "ios", "android"] as const).map((p) => {
                      const s = tabStatsData.by_platform?.[p] || { visits: 0, avg_duration_sec: 0 };
                      const label = p === "web" ? "웹" : p === "ios" ? "iOS" : "Android";
                      return (
                        <div key={p} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800">
                          <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">{label}</p>
                          <p className="mt-1 text-lg font-bold text-zinc-900 dark:text-zinc-100">
                            {(s.visits || 0).toLocaleString()}
                            <span className="ml-1 text-[11px] font-medium text-zinc-400">회</span>
                          </p>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">평균 {formatTabDuration(s.avg_duration_sec)}</p>
                        </div>
                      );
                    })}
                  </div>
                  {/* 탭 × 플랫폼 표 */}
                  <p className="mb-1.5 text-[11px] font-semibold text-zinc-400">탭 × 플랫폼 상세</p>
                  <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                    <table className="w-full text-[12px]">
                      <thead className="bg-zinc-50 dark:bg-zinc-800">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-zinc-500">탭</th>
                          <th className="px-3 py-2 text-right font-semibold text-zinc-500">웹</th>
                          <th className="px-3 py-2 text-right font-semibold text-zinc-500">iOS</th>
                          <th className="px-3 py-2 text-right font-semibold text-zinc-500">Android</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(["practical", "community", "jobs", "trade"] as const).map((t) => {
                          const label = t === "practical" ? "실기·구술" : t === "community" ? "종목후기" : t === "jobs" ? "구인" : "거래";
                          return (
                            <tr key={t} className="border-t border-zinc-100 dark:border-zinc-800">
                              <td className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-200">{label}</td>
                              {(["web", "ios", "android"] as const).map((p) => {
                                const s = tabStatsData.by_tab_platform?.[`${t}__${p}`] || { visits: 0, avg_duration_sec: 0 };
                                return (
                                  <td key={p} className="px-3 py-2 text-right">
                                    <span className="font-semibold text-zinc-800 dark:text-zinc-100">{(s.visits || 0).toLocaleString()}</span>
                                    <span className="ml-1 text-zinc-400">({formatTabDuration(s.avg_duration_sec)})</span>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : tabStatsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <p className="py-4 text-center text-[12px] text-zinc-400">기간을 선택하고 새로고침을 눌러 주세요.</p>
              )}
            </div>
          </div>
        )}

        {/* ===== 리포트 탭 ===== */}
        {tab === "report" && (
          <div className="p-4">
            {reportLoading && !reportData ? (
              <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : reportData ? (
              <ReportTabContent
                data={reportData}
                period={reportPeriod}
                offset={reportOffset}
                customFrom={reportCustomFrom}
                customTo={reportCustomTo}
                onChangePeriod={(p) => {
                  setReportPeriod(p);
                  setReportOffset(0);
                  if (p !== "custom") loadReport(p, 0);
                }}
                onChangeOffset={(o) => { setReportOffset(o); loadReport(reportPeriod, o, reportCustomFrom, reportCustomTo); }}
                onChangeCustomFrom={setReportCustomFrom}
                onChangeCustomTo={setReportCustomTo}
                onApplyCustom={() => loadReport("custom", 0, reportCustomFrom, reportCustomTo)}
                loading={reportLoading}
              />
            ) : (
              <p className="text-center py-16 text-sm text-zinc-400">리포트 데이터를 불러올 수 없습니다.</p>
            )}
          </div>
        )}

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
                      <span className="shrink-0 text-xs text-zinc-400">{inq.current_nickname || inq.author}</span>
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
                      <span>{inq.current_nickname || inq.author}</span>
                      {inq.email && <span>{inq.email}</span>}
                      <span>{new Date(inq.created_at).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" })}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== 공지 관리 탭 ===== */}
        {tab === "notice" && (
          <div className="p-4">
            <div className="rounded-2xl bg-white p-6 dark:bg-zinc-900">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">공지사항 관리</h3>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">모든 종목 후기 게시판 최상단에 표시됩니다. 앱에도 동일하게 반영됩니다.</p>
                </div>
                {notice && noticeMode === "view" && (
                  <button onClick={() => setNoticeMode("edit")}
                    className="shrink-0 rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-600">수정</button>
                )}
              </div>

              {noticeMsg && <p className={`mb-4 rounded-lg px-3 py-2 text-sm ${noticeMsg.type === "error" ? "bg-red-50 text-red-500 dark:bg-red-950" : "bg-green-50 text-green-600 dark:bg-green-950"}`}>{noticeMsg.text}</p>}

              {/* 현재 공지 보기 모드 */}
              {notice && noticeMode === "view" && (
                <div className="space-y-3">
                  <div className="rounded-xl bg-zinc-50 px-4 py-3 dark:bg-zinc-800">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-bold text-white">공지</span>
                      <span className="text-xs text-zinc-400">{new Date(notice.updated_at || notice.created_at).toLocaleString("ko-KR")}</span>
                    </div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{notice.title}</p>
                    <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{notice.content}</div>
                  </div>
                </div>
              )}

              {/* 수정/생성 모드 */}
              {(noticeMode === "edit" || noticeMode === "create") && (
                <div className="space-y-3">
                  {noticeMode === "create" && (
                    <div className="rounded-xl bg-amber-50 px-4 py-3 dark:bg-amber-950/30">
                      <p className="text-sm text-amber-600 dark:text-amber-400">현재 등록된 공지가 없습니다. 새 공지를 작성해주세요.</p>
                    </div>
                  )}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">공지 제목</label>
                    <input type="text" value={noticeTitle} onChange={(e) => { setNoticeTitle(e.target.value); setNoticeMsg(null); }}
                      placeholder="공지 제목을 입력해주세요"
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-violet-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">공지 내용</label>
                    <textarea value={noticeContent} onChange={(e) => { setNoticeContent(e.target.value); setNoticeMsg(null); }}
                      placeholder="공지 내용을 입력해주세요"
                      rows={8}
                      className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-violet-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
                  </div>
                  <div className="flex gap-2">
                    {noticeMode === "edit" && (
                      <button onClick={() => { setNoticeMode("view"); setNoticeTitle(notice?.title || ""); setNoticeContent(notice?.content || ""); setNoticeMsg(null); }}
                        className="flex-1 rounded-xl border border-zinc-200 py-3 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">취소</button>
                    )}
                    <button onClick={handleSaveNotice} disabled={noticeLoading}
                      className="flex-1 rounded-xl bg-violet-500 py-3 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-50">
                      {noticeLoading ? "저장 중..." : noticeMode === "edit" ? "공지 수정" : "공지 등록"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== 푸시 알림 탭 ===== */}
        {tab === "push" && (
          <div className="p-4 space-y-4">
            {/* 전송 폼 */}
            <div className="rounded-2xl bg-white p-6 dark:bg-zinc-900">
              <h3 className="mb-1 text-base font-bold text-zinc-900 dark:text-zinc-100">알림 전송</h3>
              <p className="mb-5 text-sm text-zinc-500 dark:text-zinc-400">앱을 사용하는 모든 사용자에게 푸시 알림을 보냅니다.</p>

              {pushMsg && <p className={`mb-4 rounded-lg px-3 py-2 text-sm ${pushMsg.type === "error" ? "bg-red-50 text-red-500 dark:bg-red-950" : "bg-green-50 text-green-600 dark:bg-green-950"}`}>{pushMsg.text}</p>}

              <div className="space-y-3">
                {/* 알림 타입 선택 */}
                <div>
                  <label className="mb-2 block text-xs font-medium text-zinc-500 dark:text-zinc-400">알림 타입 *</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPushType("notice")}
                      className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${
                        pushType === "notice"
                          ? "border-violet-500 bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300"
                          : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      📢 공지
                      <p className="text-[11px] font-normal mt-0.5 opacity-70">전체 사용자</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPushType("ad")}
                      className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${
                        pushType === "ad"
                          ? "border-amber-500 bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300"
                          : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      🎯 광고/프로모션
                      <p className="text-[11px] font-normal mt-0.5 opacity-70">수신 동의자만</p>
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">알림 제목 *</label>
                  {pushType === "ad" ? (
                    <div className="flex w-full items-stretch overflow-hidden rounded-xl border border-amber-300 bg-zinc-50 focus-within:border-amber-500 dark:border-amber-700 dark:bg-zinc-800">
                      <span className="select-none bg-amber-100 px-3 py-3 text-sm font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-400">(광고)</span>
                      <input
                        type="text"
                        value={pushTitle}
                        onChange={(e) => {
                          // 사용자가 (광고) 를 직접 못 입력하게 — 들어오면 제거
                          let v = e.target.value;
                          v = v.replace(/^\(광고\)\s*/u, "");
                          setPushTitle(v);
                          setPushMsg(null);
                        }}
                        placeholder="예: 봄맞이 이벤트 안내"
                        className="flex-1 bg-transparent px-3 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-100"
                      />
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={pushTitle}
                      onChange={(e) => { setPushTitle(e.target.value); setPushMsg(null); }}
                      placeholder="예: 새로운 기능이 추가되었어요!"
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-violet-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                  )}
                  {pushType === "ad" && (
                    <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                      정보통신망법 제50조: 광고성 메시지는 제목 시작에 (광고) 표시 의무. 자동으로 붙이며 제거할 수 없습니다.
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">알림 내용 *</label>
                  <textarea value={pushBody} onChange={(e) => { setPushBody(e.target.value); setPushMsg(null); }}
                    placeholder="알림 내용을 입력해주세요"
                    rows={3}
                    className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-violet-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">링크 URL (선택)</label>
                  <input type="text" value={pushUrl} onChange={(e) => setPushUrl(e.target.value)}
                    placeholder="알림 클릭 시 이동할 URL (선택)"
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-violet-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
                </div>

                {/* 미리보기 */}
                {(pushTitle.trim() || pushBody.trim()) && (
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
                    <p className="mb-1 text-xs font-medium text-zinc-400">미리보기</p>
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-950">
                        <svg className="h-5 w-5 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{pushTitle || "(제목)"}</p>
                        <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-300">{pushBody || "(내용)"}</p>
                      </div>
                    </div>
                  </div>
                )}

                {!pushConfirm ? (
                  <button onClick={() => { if (!pushTitle.trim() || !pushBody.trim()) { setPushMsg({ type: "error", text: "제목과 내용을 입력해주세요" }); return; } setPushConfirm(true); }}
                    className="w-full rounded-xl bg-violet-500 py-3 text-sm font-semibold text-white hover:bg-violet-600">
                    전송하기
                  </button>
                ) : (
                  <div className="rounded-xl border-2 border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
                    <p className="mb-3 text-sm font-semibold text-red-600 dark:text-red-400">정말 모든 사용자에게 푸시 알림을 보내시겠습니까?</p>
                    <p className="mb-4 text-xs text-red-500 dark:text-red-400">전송 후 취소할 수 없습니다.</p>
                    <div className="flex gap-2">
                      <button onClick={() => setPushConfirm(false)}
                        className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">취소</button>
                      <button onClick={handleSendPush} disabled={pushSending}
                        className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50">
                        {pushSending ? "전송 중..." : "전송 확인"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 전송 이력 */}
            <div className="rounded-2xl bg-white p-6 dark:bg-zinc-900">
              <h3 className="mb-4 text-base font-bold text-zinc-900 dark:text-zinc-100">전송 이력</h3>
              {pushHistory.length === 0 ? (
                <p className="text-center text-sm text-zinc-400 py-8">전송 이력이 없습니다</p>
              ) : (
                <div className="space-y-3">
                  {pushHistory.map((item: any) => (
                    <div key={item.id} className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                      {/* 헤더: 날짜 + 타입 */}
                      <div className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-800 px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.broadcast_type === "event" ? "bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400" :
                            item.broadcast_type === "ad" ? "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400" :
                            "bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-400"
                          }`}>
                            {item.broadcast_type === "event" ? "이벤트" : item.broadcast_type === "ad" ? "광고" : "공지"}
                          </span>
                          <span className="text-xs text-zinc-400">
                            {new Date(item.created_at).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      </div>
                      {/* 본문 */}
                      <div className="px-4 py-3">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">{item.title}</p>
                        <p className="text-sm text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap">{item.body}</p>
                      </div>
                      {/* 결과 */}
                      <div className="flex items-center gap-3 px-4 py-2 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/50">
                        <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                          성공 {item.sent_count || 0}건
                        </span>
                        {(item.fail_count > 0) && (
                          <span className="text-xs text-red-500 font-medium">
                            실패 {item.fail_count}건
                          </span>
                        )}
                        {(!item.sent_count && !item.fail_count) && (
                          <span className="text-xs text-zinc-400">발송 대기 중</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
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

        {/* ===== USER 조회 탭 ===== */}
        {tab === "user" && (
          <div className="p-4 space-y-4">
            <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-2">닉네임으로 사용자 조회 (특정 사용자 상세)</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") lookupUser(); }}
                  placeholder="닉네임을 입력 (현재/과거 닉네임 모두 검색 가능)"
                  className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
                <button
                  onClick={lookupUser}
                  disabled={userLoading}
                  className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-50"
                >
                  {userLoading ? "조회 중…" : "조회"}
                </button>
              </div>
              {userError && <p className="mt-2 text-sm text-red-500">{userError}</p>}
            </div>

            {userResult && (
              <div className="space-y-4">
                {userResult.matchedFromHistory && (
                  <div className="rounded-lg bg-amber-50 px-4 py-2.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                    입력하신 닉네임은 현재 사용 중이 아닙니다 — 닉네임 이력에서 매칭하여 표시합니다.
                  </div>
                )}

                {/* 기본 정보 */}
                <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                  <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-200 mb-3">기본 정보</h3>
                  <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                    <Field label="현재 닉네임" value={userResult.nickname} />
                    <Field label="firebase_uid" value={userResult.firebase_uid} mono />
                    <Field label="이메일" value={userResult.firebaseUser?.email || "-"} />
                    <Field label="이메일 인증" value={userResult.firebaseUser?.emailVerified ? "예" : "아니오"} />
                    <Field label="로그인 제공자" value={(userResult.firebaseUser?.providers || []).join(", ") || "-"} />
                    <Field label="가입 시각" value={userResult.firebaseUser?.createdAt ? new Date(userResult.firebaseUser.createdAt).toLocaleString("ko-KR") : "-"} />
                    <Field label="마지막 로그인" value={userResult.firebaseUser?.lastSignInAt ? new Date(userResult.firebaseUser.lastSignInAt).toLocaleString("ko-KR") : "-"} />
                    <Field label="계정 비활성" value={userResult.firebaseUser?.disabled ? "예" : "아니오"} />
                    <Field label="활동 지역" value={userResult.nicknames_record?.active_region_name || "-"} />
                    <Field label="약관 동의 시각" value={userResult.nicknames_record?.terms_agreed_at ? new Date(userResult.nicknames_record.terms_agreed_at).toLocaleString("ko-KR") : "-"} />
                    <Field label="개인정보 동의 시각" value={userResult.nicknames_record?.privacy_agreed_at ? new Date(userResult.nicknames_record.privacy_agreed_at).toLocaleString("ko-KR") : "-"} />
                    <Field label="약관 버전" value={userResult.nicknames_record?.terms_version || "-"} />
                    <Field label="마지막 닉네임 변경" value={userResult.nicknames_record?.changed_at ? new Date(userResult.nicknames_record.changed_at).toLocaleString("ko-KR") : "-"} />
                    <Field
                      label="광고/프로모션 동의"
                      value={
                        userResult.notification_prefs?.notify_promo
                          ? `동의 (${userResult.notification_prefs.notify_promo_agreed_at ? new Date(userResult.notification_prefs.notify_promo_agreed_at).toLocaleString("ko-KR") : "시점 미기록"})`
                          : userResult.notification_prefs?.notify_promo_agreed_at
                            ? `현재 거부 (마지막 동의 ${new Date(userResult.notification_prefs.notify_promo_agreed_at).toLocaleString("ko-KR")})`
                            : "미동의"
                      }
                    />
                  </dl>
                </div>

                {/* 활동 카운트 */}
                <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                  <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-200 mb-3">활동 카운트</h3>
                  <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-5">
                    <Stat label="작성 글" value={userResult.counts.posts} />
                    <Stat label="작성 댓글" value={userResult.counts.comments} />
                    <Stat label="구인글" value={userResult.counts.jobs} />
                    <Stat label="거래글" value={userResult.counts.trades} />
                    <Stat label="차단함" value={userResult.counts.blocks_made} />
                    <Stat label="보낸 쪽지" value={userResult.counts.messages_sent} />
                    <Stat label="받은 쪽지" value={userResult.counts.messages_received} />
                    <Stat label="후기 북마크" value={userResult.counts.post_bookmarks} />
                    <Stat label="구인 북마크" value={userResult.counts.job_bookmarks} />
                    <Stat label="거래 북마크" value={userResult.counts.trade_bookmarks} />
                  </div>
                </div>

                {/* 닉네임 이력 */}
                <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                  <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-200 mb-3">닉네임 변경 이력 ({userResult.nickname_history.length}건)</h3>
                  {userResult.nickname_history.length === 0 ? (
                    <p className="text-xs text-zinc-400">기록 없음 (이력 시스템 도입 이전 사용자일 수 있음)</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[600px] text-xs">
                        <thead className="text-zinc-500 dark:text-zinc-400">
                          <tr className="border-b border-zinc-200 dark:border-zinc-800">
                            <th className="py-1.5 text-left font-semibold">변경 시각</th>
                            <th className="py-1.5 text-left font-semibold">이전 닉네임</th>
                            <th className="py-1.5 text-left font-semibold">→ 새 닉네임</th>
                            <th className="py-1.5 text-left font-semibold">사유</th>
                            <th className="py-1.5 text-left font-semibold">IP</th>
                          </tr>
                        </thead>
                        <tbody>
                          {userResult.nickname_history.map((h: any) => (
                            <tr key={h.id} className="border-b border-zinc-100 dark:border-zinc-800">
                              <td className="py-1.5 text-zinc-600 dark:text-zinc-300">{new Date(h.changed_at).toLocaleString("ko-KR")}</td>
                              <td className="py-1.5 text-zinc-700 dark:text-zinc-200">{h.old_nickname || <span className="text-zinc-400">(없음)</span>}</td>
                              <td className="py-1.5 font-semibold text-cyan-700 dark:text-cyan-300">{h.new_nickname}</td>
                              <td className="py-1.5 text-zinc-500">{h.reason || "-"}</td>
                              <td className="py-1.5 font-mono text-[10px] text-zinc-400">{h.ip_address || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 접속 이력 (최근 30회) */}
                <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                  <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-200 mb-3">
                    접속 이력 (최근 {(userResult.login_log || []).length}회)
                  </h3>
                  {(userResult.login_log || []).length === 0 ? (
                    <p className="text-[12px] text-zinc-400">기록된 접속 이력이 없습니다. (2026-05-09 이후 로그인부터 기록됨)</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-[12px]">
                        <thead className="bg-zinc-50 dark:bg-zinc-800">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-zinc-500">접속 시각</th>
                            <th className="px-2 py-2 text-center font-semibold text-zinc-500">플랫폼</th>
                            <th className="px-3 py-2 text-left font-semibold text-zinc-500">IP 해시</th>
                            <th className="px-3 py-2 text-left font-semibold text-zinc-500">User-Agent</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(userResult.login_log || []).map((l: any) => (
                            <tr key={l.id} className="border-t border-zinc-100 dark:border-zinc-800 align-top">
                              <td className="px-3 py-2 whitespace-nowrap text-zinc-700 dark:text-zinc-200">
                                {new Date(l.signed_in_at).toLocaleString("ko-KR")}
                              </td>
                              <td className="px-2 py-2 text-center whitespace-nowrap">
                                <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                  l.platform === "web"
                                    ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                                    : l.platform === "ios"
                                      ? "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
                                      : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                                }`}>
                                  {l.platform === "web" ? "웹" : l.platform === "ios" ? "iOS" : "Android"}
                                </span>
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-zinc-400 font-mono text-[11px]">{l.ip_hash || "-"}</td>
                              <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400 truncate max-w-[280px]" title={l.user_agent || ""}>
                                {l.user_agent || "-"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="mt-2 text-[10px] text-zinc-400">최대 30건 표시 · 자동 토큰 갱신은 기록되지 않음 (실제 로그인 행위만)</p>
                    </div>
                  )}
                </div>

                {/* 최근 활동 */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <RecentList
                    title="최근 작성 글"
                    items={userResult.recent.posts.map((p: any) => ({
                      id: p.id,
                      label: p.title,
                      time: p.created_at,
                      url: p.category_id ? `/category/${p.category_id}/post/${p.id}` : null,
                    }))}
                  />
                  <RecentList
                    title="최근 작성 댓글"
                    items={userResult.recent.comments.map((c: any) => ({
                      id: c.id,
                      label: c.content,
                      time: c.created_at,
                      url: c.posts?.category_id && c.post_id ? `/category/${c.posts.category_id}/post/${c.post_id}?hc=${c.id}` : null,
                    }))}
                  />
                  <RecentList
                    title="최근 구인글"
                    items={userResult.recent.jobs.map((j: any) => ({
                      id: j.id,
                      label: j.title + (j.is_closed ? " (마감)" : ""),
                      time: j.created_at,
                      url: `/jobs/${j.id}`,
                    }))}
                  />
                  <RecentList
                    title="최근 거래글"
                    items={userResult.recent.trades.map((t: any) => ({
                      id: t.id,
                      label: `[${t.category}] ${t.title} (${t.status})`,
                      time: t.created_at,
                      url: `/trade/${t.id}`,
                    }))}
                  />
                </div>

                {/* ===== 쪽지 본문 (법적 분쟁 대응) ===== */}
                <div className="rounded-xl border border-amber-200 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/20">
                  <button
                    onClick={() => setUserMessagesExpanded((v) => !v)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="text-left">
                      <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100">
                        🔒 쪽지 본문 ({(userResult.messages || []).length}건 / 전체 보낸 {userResult.counts?.messages_sent || 0} · 받은 {userResult.counts?.messages_received || 0})
                      </p>
                      <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">
                        법적 분쟁 대응 전용 · 사용자 측 삭제 메시지도 증빙 목적으로 표시됨 · 외부 유출 금지
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                      {userMessagesExpanded ? "접기" : "펼치기"}
                    </span>
                  </button>
                  {userMessagesExpanded && (
                    <div className="border-t border-amber-200 dark:border-amber-900">
                      {(userResult.messages || []).length === 0 ? (
                        <p className="px-4 py-6 text-center text-[12px] text-zinc-400">주고받은 쪽지가 없습니다.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-[12px]">
                            <thead className="bg-amber-100/60 dark:bg-amber-950/40">
                              <tr>
                                <th className="px-3 py-2 text-left font-semibold text-zinc-600 dark:text-zinc-300">시간</th>
                                <th className="px-2 py-2 text-center font-semibold text-zinc-600 dark:text-zinc-300">방향</th>
                                <th className="px-2 py-2 text-left font-semibold text-zinc-600 dark:text-zinc-300">상대방</th>
                                <th className="px-3 py-2 text-left font-semibold text-zinc-600 dark:text-zinc-300">내용</th>
                                <th className="px-2 py-2 text-center font-semibold text-zinc-600 dark:text-zinc-300">상태</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(userResult.messages || []).map((m: any) => {
                                const flags: string[] = [];
                                if (m.spam_reported_by_receiver) flags.push("스팸신고");
                                if (m.deleted_by_sender) flags.push("발신측삭제");
                                if (m.deleted_by_receiver) flags.push("수신측삭제");
                                if (!m.is_read) flags.push("미읽음");
                                return (
                                  <tr key={m.id} className="border-t border-amber-100 dark:border-amber-950/60 align-top">
                                    <td className="px-3 py-2 whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                                      {new Date(m.created_at).toLocaleString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                    </td>
                                    <td className="px-2 py-2 text-center whitespace-nowrap">
                                      <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${m.direction === "sent" ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"}`}>
                                        {m.direction === "sent" ? "보냄" : "받음"}
                                      </span>
                                    </td>
                                    <td className="px-2 py-2 whitespace-nowrap text-zinc-700 dark:text-zinc-200">
                                      {m.counterpart_nickname}
                                    </td>
                                    <td className="px-3 py-2 text-zinc-800 dark:text-zinc-100 whitespace-pre-wrap break-words max-w-[320px]">
                                      {m.content}
                                      {m.parent_id && <span className="ml-1 text-[10px] text-zinc-400">↵ 답장</span>}
                                    </td>
                                    <td className="px-2 py-2 text-center whitespace-nowrap">
                                      {flags.length === 0 ? (
                                        <span className="text-zinc-400">-</span>
                                      ) : (
                                        <div className="flex flex-col gap-0.5 text-[10px]">
                                          {flags.map((f) => (
                                            <span key={f} className={`inline-block rounded px-1.5 py-0.5 font-semibold ${f === "스팸신고" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : f.includes("삭제") ? "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400" : "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300"}`}>
                                              {f}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {(userResult.counts?.messages_sent || 0) + (userResult.counts?.messages_received || 0) > (userResult.messages || []).length && (
                        <p className="px-4 py-3 text-center text-[11px] text-zinc-400 border-t border-amber-100 dark:border-amber-950/60">
                          최근 100건만 표시됩니다 · 더 오래된 쪽지가 필요하면 별도 조회 필요
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── 전체 유저 리스트 (30명/페이지) — 맨 아래 ── */}
            <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-200">
                  전체 유저
                  {userListData && (
                    <span className="ml-2 text-xs font-normal text-zinc-400">
                      총 {userListData.total.toLocaleString()}명 · {userListData.page}/{userListData.totalPages || 1}p
                    </span>
                  )}
                </h3>
                <button
                  onClick={() => { setUserListData(null); loadUserList(userListPage); }}
                  disabled={userListLoading}
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  {userListLoading ? "로드 중…" : "새로고침"}
                </button>
              </div>

              {userListError && <p className="mb-2 text-sm text-red-500">{userListError}</p>}

              {userListLoading && !userListData ? (
                <div className="flex justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" /></div>
              ) : userListData && userListData.users.length === 0 ? (
                <p className="py-8 text-center text-xs text-zinc-400">사용자가 없습니다</p>
              ) : userListData ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px] text-xs">
                      <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                        <tr>
                          <th className="py-2 pr-2 text-left font-semibold">#</th>
                          <th className="py-2 pr-2 text-left font-semibold">닉네임 (이메일)</th>
                          <th className="py-2 pr-2 text-left font-semibold">가입일</th>
                          <th className="py-2 pr-2 text-right font-semibold">닉변</th>
                          <th className="py-2 pr-2 text-right font-semibold">글</th>
                          <th className="py-2 pr-2 text-right font-semibold">댓글</th>
                          <th className="py-2 pr-2 text-right font-semibold">구인</th>
                          <th className="py-2 pr-2 text-right font-semibold">거래</th>
                          <th className="py-2 pr-2 text-right font-semibold">상세</th>
                        </tr>
                      </thead>
                      <tbody>
                        {userListData.users.map((u: any, i: number) => {
                          const startIdx = (userListData.page - 1) * userListData.limit;
                          return (
                            <tr key={u.firebase_uid} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                              <td className="py-1.5 pr-2 text-zinc-400">{startIdx + i + 1}</td>
                              <td className="py-1.5 pr-2">
                                <div className="font-semibold text-zinc-800 dark:text-zinc-100">{u.nickname}</div>
                                <div className="text-[10px] text-zinc-400">{u.email || "-"}</div>
                              </td>
                              <td className="py-1.5 pr-2 text-zinc-600 dark:text-zinc-300">
                                {u.created_at ? new Date(u.created_at).toLocaleDateString("ko-KR") : "-"}
                              </td>
                              <td className="py-1.5 pr-2 text-right tabular-nums text-zinc-700 dark:text-zinc-200">{u.nick_change_count}</td>
                              <td className="py-1.5 pr-2 text-right tabular-nums text-zinc-700 dark:text-zinc-200">{u.posts}</td>
                              <td className="py-1.5 pr-2 text-right tabular-nums text-zinc-700 dark:text-zinc-200">{u.comments}</td>
                              <td className="py-1.5 pr-2 text-right tabular-nums text-zinc-700 dark:text-zinc-200">{u.jobs}</td>
                              <td className="py-1.5 pr-2 text-right tabular-nums text-zinc-700 dark:text-zinc-200">{u.trades}</td>
                              <td className="py-1.5 pr-2 text-right">
                                <button
                                  onClick={() => { setUserQuery(u.nickname); lookupUser(); }}
                                  className="rounded-md bg-cyan-50 px-2 py-1 text-[10px] font-bold text-cyan-700 hover:bg-cyan-100 dark:bg-cyan-950/40 dark:text-cyan-300 dark:hover:bg-cyan-950/60"
                                >
                                  조회
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* 페이지네이션 */}
                  {userListData.totalPages > 1 && (
                    <div className="mt-4 flex items-center justify-center gap-2">
                      <button
                        onClick={() => { const p = Math.max(1, userListPage - 1); setUserListPage(p); loadUserList(p); }}
                        disabled={userListPage <= 1 || userListLoading}
                        className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        이전
                      </button>
                      <span className="text-xs text-zinc-500">
                        {userListPage} / {userListData.totalPages}
                      </span>
                      <button
                        onClick={() => { const p = Math.min(userListData.totalPages, userListPage + 1); setUserListPage(p); loadUserList(p); }}
                        disabled={userListPage >= userListData.totalPages || userListLoading}
                        className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        다음
                      </button>
                    </div>
                  )}
                </>
              ) : null}
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
                <span className="text-sm text-zinc-900 dark:text-zinc-100">{selectedInq.current_nickname || selectedInq.author}</span>
              </div>
              <div className="flex border-b border-zinc-100 pb-2 dark:border-zinc-800">
                <span className="w-16 shrink-0 text-sm font-medium text-zinc-500 dark:text-zinc-400">이메일</span>
                <span className="text-sm text-zinc-900 dark:text-zinc-100">{selectedInq.current_email || selectedInq.email || "-"}</span>
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
              신고된 {(() => {
                const t = reports.find((r) => r.id === deleteConfirmId)?.target_type;
                return t === "post" ? "게시글" : t === "job" ? "구인글" : t === "message" ? "쪽지" : "댓글";
              })()}을(를) 삭제하고 처리 완료로 이동합니다.
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
  const tagColor =
    report.target_type === "post" ? "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-400"
    : report.target_type === "job" ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
    : report.target_type === "message" ? "bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-400"
    : "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400";
  const tagLabel =
    report.target_type === "post" ? "종목후기"
    : report.target_type === "job" ? "구인글"
    : report.target_type === "message" ? "쪽지"
    : "댓글";
  const targetWord =
    report.target_type === "post" ? "게시글이"
    : report.target_type === "job" ? "구인글이"
    : report.target_type === "message" ? "쪽지가"
    : "댓글이";
  const detailHref =
    report.target_type === "job" ? `/jobs/${report.target_id}`
    : `/category/${report.category_id}/post/${report.post_id}`;

  return (
    <div className={`rounded-2xl border bg-white p-4 dark:bg-zinc-900 ${report.resolved ? "border-green-200 dark:border-green-900" : "border-zinc-200 dark:border-zinc-800"}`}>
      {/* 상단 */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${tagColor}`}>{tagLabel}</span>
          {report.category_name && <span className="text-xs text-zinc-400">{report.category_name}</span>}
          {report.resolved && report.deleted_at && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600 dark:bg-red-950 dark:text-red-400">삭제됨</span>}
          {report.resolved && !report.deleted_at && <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-600 dark:bg-green-950 dark:text-green-400">처리됨</span>}
        </div>
        <span className="text-xs text-zinc-400">{new Date(report.created_at).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
      </div>

      {/* 신고자 정보 */}
      <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900 dark:bg-blue-950/30">
        <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">신고자</p>
        <p className="mt-1 text-sm text-blue-900 dark:text-blue-100">
          {report.reporter_nickname || report.reporter_email || "-"}
          {report.reporter_email && report.reporter_nickname ? (
            <span className="ml-2 text-xs text-blue-700/70 dark:text-blue-400/80">{report.reporter_email}</span>
          ) : null}
        </p>
      </div>

      {/* 신고 대상 */}
      <div className="mb-3 rounded-xl bg-zinc-50 px-4 py-3 dark:bg-zinc-800">
        {report.target_type === "post" ? (
          <>
            <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">신고된 종목후기</p>
            <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{report.post_title || (report.target_exists ? "(제목 없음)" : "(삭제된 게시글)")}</p>
            <p className="mt-0.5 text-xs text-zinc-400">
              작성자: {report.post_author || "-"}
              {report.post_author_email ? <span className="ml-1.5 text-zinc-400/80">{report.post_author_email}</span> : null}
            </p>
          </>
        ) : report.target_type === "message" ? (
          <>
            <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">쪽지 내용</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">{report.message_content || (report.target_exists ? "(내용 없음)" : "(삭제된 쪽지)")}</p>
            <p className="mt-0.5 text-xs text-zinc-400">
              발신자: {report.message_sender || "-"}
              {report.message_sender_email ? <span className="ml-1.5 text-zinc-400/80">{report.message_sender_email}</span> : null}
            </p>
            {report.message_receiver && <p className="text-xs text-zinc-400">수신자: {report.message_receiver}</p>}
          </>
        ) : report.target_type === "job" ? (
          <>
            <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">신고된 구인글</p>
            <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{report.job_title || (report.target_exists ? "(제목 없음)" : "(삭제된 구인글)")}</p>
            <p className="mt-0.5 text-xs text-zinc-400">
              작성자: {report.job_author || "-"}
              {report.job_author_email ? <span className="ml-1.5 text-zinc-400/80">{report.job_author_email}</span> : null}
            </p>
          </>
        ) : (
          <>
            <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">신고된 댓글</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">{report.comment_content || (report.target_exists ? "(내용 없음)" : "(삭제된 댓글)")}</p>
            <p className="mt-0.5 text-xs text-zinc-400">
              작성자: {report.comment_author || "-"}
              {report.comment_author_email ? <span className="ml-1.5 text-zinc-400/80">{report.comment_author_email}</span> : null}
            </p>
            {report.post_title ? (
              <>
                <hr className="my-2 border-zinc-200 dark:border-zinc-700" />
                <p className="text-xs text-zinc-400">게시글: {report.post_title}</p>
              </>
            ) : null}
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
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">관리자에 의해 {targetWord} 삭제되었습니다.</p>
          <p className="mt-0.5 text-xs text-zinc-400">삭제 시각: {new Date(report.deleted_at).toLocaleString("ko-KR")}</p>
        </div>
      )}

      {/* 버튼 */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {!report.resolved && onDelete && (
          <button onClick={() => onDelete(report.id)} className="rounded-lg bg-red-500 px-4 py-2 text-xs font-semibold text-white hover:bg-red-600">삭제하기</button>
        )}
        {report.target_type !== "message" && (
          <Link href={detailHref} className="rounded-lg bg-violet-500 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-600">바로가기</Link>
        )}
        {!report.resolved && onResolve && (
          <button onClick={() => onResolve(report.id)} className="rounded-lg border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">처리 완료</button>
        )}
      </div>
    </div>
  );
}

/* ── 리포트 탭 ── */
function ReportTabContent({
  data, period, offset, customFrom, customTo,
  onChangePeriod, onChangeOffset, onChangeCustomFrom, onChangeCustomTo, onApplyCustom,
  loading,
}: {
  data: any;
  period: "day" | "week" | "month" | "custom";
  offset: number;
  customFrom: string;
  customTo: string;
  onChangePeriod: (p: "day" | "week" | "month" | "custom") => void;
  onChangeOffset: (o: number) => void;
  onChangeCustomFrom: (v: string) => void;
  onChangeCustomTo: (v: string) => void;
  onApplyCustom: () => void;
  loading: boolean;
}) {
  const fmtRange = (from: string, to: string) => {
    const f = new Date(from); const t = new Date(to);
    const wk = ["일","월","화","수","목","금","토"];
    const fmt = (d: Date) => `${String(d.getFullYear()).slice(2)}. ${d.getMonth() + 1}. ${d.getDate()}. ${wk[d.getDay()]}`;
    return `${fmt(f)} - ${fmt(t)}`;
  };
  const isCustom = period === "custom";

  return (
    <div className={`space-y-4 ${loading ? "opacity-60 pointer-events-none" : ""}`}>
      {/* ── 기간 헤더 ── */}
      <div className="flex flex-wrap items-stretch gap-3">
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 px-4 py-2 flex items-center gap-2">
          <select
            value={period}
            onChange={(e) => onChangePeriod(e.target.value as "day" | "week" | "month" | "custom")}
            className="bg-transparent text-sm font-semibold text-zinc-800 dark:text-zinc-100 focus:outline-none cursor-pointer"
          >
            <option value="day">일간</option>
            <option value="week">주간</option>
            <option value="month">월간</option>
            <option value="custom">기간 선택</option>
          </select>
        </div>
        {isCustom ? (
          <div className="flex-1 min-w-[260px] rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 px-4 py-2 flex items-center gap-2 flex-wrap">
            <input type="date" value={customFrom} onChange={(e) => onChangeCustomFrom(e.target.value)}
              className="px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm" />
            <span className="text-sm text-zinc-400">~</span>
            <input type="date" value={customTo} onChange={(e) => onChangeCustomTo(e.target.value)}
              className="px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm" />
            <button onClick={onApplyCustom}
              disabled={!customFrom || !customTo}
              className="ml-auto px-4 py-1 rounded-md bg-emerald-500 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed">조회</button>
            {data?.range?.from && data?.range?.to && customFrom && customTo && (
              <span className="basis-full text-[11px] text-zinc-400 mt-1">
                현재 조회 중: {fmtRange(data.range.from, data.range.to)}
              </span>
            )}
          </div>
        ) : (
          <div className="flex-1 min-w-[260px] rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 px-4 py-2 flex items-center justify-between">
            <button onClick={() => onChangeOffset(offset + 1)}
              className="text-emerald-500 hover:text-emerald-600 px-2"
              aria-label="이전 기간"
            >◀</button>
            <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              {fmtRange(data.range.from, data.range.to)}
            </span>
            <button onClick={() => onChangeOffset(Math.max(0, offset - 1))}
              disabled={offset === 0}
              className={`px-2 ${offset === 0 ? "text-zinc-300 dark:text-zinc-700" : "text-emerald-500 hover:text-emerald-600"}`}
              aria-label="다음 기간"
            >▶</button>
          </div>
        )}
      </div>

      {/* ── 방문 전 지표 (3카드) ── */}
      <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 p-4">
        <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-200 mb-3">
          방문 전 지표 <span className="text-emerald-500 ml-1">3</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <ReportSummaryCard label="사이트 방문" m={data.metrics.visits} />
          <ReportSummaryCard label="신규 가입" m={data.metrics.signups} />
          <ReportSummaryCard label="스토어 클릭" m={data.metrics.storeClicks} />
        </div>
      </div>

      {/* ── 방문 후 지표 (3카드) ── */}
      <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 p-4">
        <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-200 mb-3">
          방문 후 지표 <span className="text-emerald-500 ml-1">3</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <ReportSummaryCard label="게시글 작성" m={data.metrics.posts} />
          <ReportSummaryCard label="댓글 작성" m={data.metrics.comments} />
          <ReportSummaryCard label="구인글 등록" m={data.metrics.jobs} />
        </div>
      </div>

      {/* ── 상세 카드 (2열) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ReportDetailCard
          title="사이트 방문"
          m={data.metrics.visits}
          period={period}
          extra={
            data.inflow?.channels?.length > 0 && (
              <div className="mt-4 space-y-1">
                <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">유입 채널 Top 5</p>
                {data.inflow.channels.map((c: any, i: number) => (
                  <div key={c.name} className="flex items-center gap-2 py-0.5">
                    <span className="text-xs font-bold text-zinc-400 w-4">{i+1}</span>
                    <span className="flex-1 text-xs text-zinc-700 dark:text-zinc-300 truncate">{c.name}</span>
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{c.count}회</span>
                  </div>
                ))}
              </div>
            )
          }
        />
        <ReportDetailCard
          title="신규 가입"
          m={data.metrics.signups}
          period={period}
        />
        <ReportDetailCard
          title="게시글 작성"
          m={data.metrics.posts}
          period={period}
          extra={
            data.topCategories?.length > 0 && (
              <div className="mt-4 space-y-1">
                <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">인기 종목 Top 5</p>
                {data.topCategories.map((c: any, i: number) => (
                  <div key={c.name} className="flex items-center gap-2 py-0.5">
                    <span className="text-xs font-bold text-zinc-400 w-4">{i+1}</span>
                    <span className="flex-1 text-xs text-zinc-700 dark:text-zinc-300 truncate">{c.name}</span>
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{c.count}회</span>
                  </div>
                ))}
              </div>
            )
          }
        />
        <ReportDetailCard
          title="댓글 작성"
          m={data.metrics.comments}
          period={period}
        />
        <ReportDetailCard
          title="구인글 등록"
          m={data.metrics.jobs}
          period={period}
        />
        <ReportDetailCard
          title="스토어 클릭"
          m={data.metrics.storeClicks}
          period={period}
          extra={
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800 p-2 text-center">
                <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100">{(data.metrics.storeClicks.appStore ?? 0).toLocaleString()}</p>
                <p className="text-[10px] text-zinc-500">App Store</p>
              </div>
              <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800 p-2 text-center">
                <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100">{(data.metrics.storeClicks.googlePlay ?? 0).toLocaleString()}</p>
                <p className="text-[10px] text-zinc-500">Google Play</p>
              </div>
            </div>
          }
        />
      </div>
    </div>
  );
}

function ReportSummaryCard({ label, m }: { label: string; m: { current: number; previous: number; changePct: number } }) {
  const up = m.changePct > 0;
  const flat = m.changePct === 0;
  return (
    <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800 p-3">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{label}</span>
        {!flat && (
          <span className={`text-xs font-bold ${up ? "text-red-500" : "text-blue-500"}`}>
            {up ? "↑" : "↓"}{Math.abs(m.changePct)}%
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1">
        {m.current.toLocaleString()}<span className="text-sm font-medium text-zinc-400 ml-0.5">회</span>
      </p>
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">지난 기간 {m.previous.toLocaleString()}회</p>
    </div>
  );
}

function ReportDetailCard({
  title, m, period, extra,
}: {
  title: string;
  m: { current: number; previous: number; changePct: number; daily: { date: string; count: number }[]; prevDaily: { date: string; count: number }[] };
  period: "day" | "week" | "month" | "custom";
  extra?: React.ReactNode;
}) {
  const days = m.daily.length || 1;
  const avg = (m.current / days).toFixed(period === "day" ? 0 : 1);
  const up = m.changePct > 0;
  const flat = m.changePct === 0;

  // 라벨(녹색) + 숫자(검은색) + 평균 - 줄바꿈 포함
  const periodWord = period === "day" ? "일" : period === "week" ? "주" : period === "month" ? "달" : "기간";

  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 p-4">
      <p className="text-sm text-zinc-700 dark:text-zinc-200 leading-relaxed">
        한 {periodWord} <span className="font-bold text-emerald-600 dark:text-emerald-400">{title}</span>은 <span className="font-bold">{m.current.toLocaleString()}회</span>,
        <br />
        일 평균 <span className="font-bold">{avg}회</span> 입니다.
      </p>
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
        {flat ? "전기간과 동일합니다." : (
          <>지난 기간 대비 <span className={`font-bold ${up ? "text-red-500" : "text-blue-500"}`}>{up ? "+" : ""}{m.changePct}%</span> {up ? "증가" : "감소"}했습니다.</>
        )}
      </p>
      <DualLineChart current={m.daily} previous={m.prevDaily} period={period} />
      {extra}
    </div>
  );
}

/* ── 듀얼 라인차트 (이번 기간 vs 지난 기간 오버레이) ── */
function DualLineChart({
  current, previous, period,
}: {
  current: { date: string; count: number }[];
  previous: { date: string; count: number }[];
  period: "day" | "week" | "month" | "custom";
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  if (current.length === 0) return <p className="text-center py-8 text-xs text-zinc-400">데이터가 없습니다</p>;

  const W = 320, H = 130, padX = 14, padTop = 14, padBottom = 28;
  const plotH = H - padTop - padBottom;
  const max = Math.max(1, ...current.map(d => d.count), ...previous.map(d => d.count));
  const xStep = current.length > 1 ? (W - padX * 2) / (current.length - 1) : 0;
  const labelY = padTop + plotH + 16;

  const curPts = current.map((d, i) => ({
    x: padX + i * xStep,
    y: padTop + plotH - (d.count / max) * plotH,
    ...d,
  }));
  const prevPts = previous.map((d, i) => ({
    x: padX + i * xStep,
    y: padTop + plotH - (d.count / max) * plotH,
    ...d,
  }));

  const wkLabel = ["월","화","수","목","금","토","일"];
  const xLabels = current.map((d, i) => {
    const dt = new Date(d.date);
    const len = current.length;
    if (period === "month" || (period === "custom" && len > 14)) {
      // 긴 기간 → 일정 간격(약 5~7일)으로 라벨
      const step = Math.max(1, Math.ceil(len / 6));
      return i % step === 0 ? `${dt.getMonth()+1}.${dt.getDate()}` : "";
    }
    if (period === "week" || (period === "custom" && len === 7)) {
      const wkIdx = (dt.getDay() + 6) % 7;
      return wkLabel[wkIdx];
    }
    // day or custom 짧은 기간 → 모두 날짜 표시
    return `${dt.getMonth()+1}.${dt.getDate()}`;
  });

  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const xInSvg = xRatio * W;
    let nearest = 0, minDist = Infinity;
    curPts.forEach((p, i) => {
      const d = Math.abs(p.x - xInSvg);
      if (d < minDist) { minDist = d; nearest = i; }
    });
    setHoverIdx(nearest);
  };

  const hovered = hoverIdx !== null ? curPts[hoverIdx] : null;
  const hoveredPrev = hoverIdx !== null ? prevPts[hoverIdx] : null;

  return (
    <div className="mt-3">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-32 cursor-crosshair block"
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* 마우스 이벤트 캐치용 투명 오버레이 — 빈 공간에서도 hover 작동 */}
        <rect x="0" y="0" width={W} height={H} fill="transparent" pointerEvents="all" />
        {/* 지난 기간 (회색) */}
        <polyline fill="none" stroke="#d4d4d8" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"
          points={prevPts.map(p => `${p.x},${p.y}`).join(" ")} />
        {/* 이번 기간 (에메랄드) */}
        <polyline fill="none" stroke="#10b981" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
          points={curPts.map(p => `${p.x},${p.y}`).join(" ")} />
        {curPts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={hoverIdx === i ? 3 : 2} fill="#10b981" />
        ))}
        {/* x축 라벨 */}
        {curPts.map((p, i) => xLabels[i] && (
          <text key={`l-${i}`} x={p.x} y={labelY} textAnchor="middle" fontSize="10" fill="#a1a1aa"
            style={{ pointerEvents: "none" }}>{xLabels[i]}</text>
        ))}
        {hovered && (() => {
          const tooltipText = `${hovered.count}회` + (hoveredPrev && hoveredPrev.count !== hovered.count ? ` (지난 ${hoveredPrev.count}회)` : "");
          // 툴팁 y: 데이터 포인트 위에 표시. 단 너무 위에 가면 잘리므로 padTop+12 이상.
          // count=0 같이 바닥에 있는 점은 위로 16px 띄워 항상 보이게.
          const tooltipY = Math.max(hovered.y - 10, padTop + 12);
          // 텍스트 크기 추정 (한국어 + 숫자 평균 7px/char @ fontSize 11)
          const estW = tooltipText.length * 7 + 12;
          // 좌우 잘림 방지: 텍스트 시작/끝 좌표 클램프
          const anchorMode: "start" | "middle" | "end" =
            hovered.x - estW / 2 < 4 ? "start"
              : hovered.x + estW / 2 > W - 4 ? "end"
              : "middle";
          const rectX = anchorMode === "start" ? hovered.x - 4
            : anchorMode === "end" ? hovered.x - estW + 4
            : hovered.x - estW / 2;
          return (
            <>
              <line x1={hovered.x} y1={padTop} x2={hovered.x} y2={padTop + plotH} stroke="#10b981" strokeWidth="1" strokeDasharray="2 2" opacity="0.4" />
              {/* 배경 pill — 0회 등 텍스트 가독성 보장 */}
              <rect
                x={rectX} y={tooltipY - 11}
                width={estW} height={15}
                rx={3}
                fill="#ecfdf5"
                stroke="#a7f3d0"
                strokeWidth="0.5"
                className="dark:fill-emerald-950 dark:stroke-emerald-800"
                style={{ pointerEvents: "none" }}
              />
              <text x={hovered.x} y={tooltipY}
                textAnchor={anchorMode}
                fontSize="11" fontWeight="700" fill="#065f46" className="dark:fill-emerald-300"
                style={{ pointerEvents: "none" }}>
                {tooltipText}
              </text>
            </>
          );
        })()}
      </svg>
      <div className="flex items-center gap-3 mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-zinc-300" />지난 기간</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-emerald-500" />이번 기간</span>
      </div>
    </div>
  );
}

function KpiCard({ label, value, accent, warn }: { label: string; value: number; accent?: boolean; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800 p-3 text-center">
      <p className={`text-xl font-bold ${warn && value > 0 ? "text-red-500" : accent ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-800 dark:text-zinc-100"}`}>
        {value.toLocaleString()}
      </p>
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">{label}</p>
    </div>
  );
}

/* ── 메인 분석 박스 내부 서브섹션 (헤더 + grid) ── */
function KpiSubsection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-3">{title}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{children}</div>
    </div>
  );
}

/* ── 신고 분석 박스 (셀렉터 + 카운트 리스트 + 파이차트) ── */
function ReportAnalysisBox({
  range, setRange, from, setFrom, to, setTo, onApply, data,
}: {
  range: "all" | "day" | "week" | "month" | "custom";
  setRange: (r: "all" | "day" | "week" | "month" | "custom") => void;
  from: string; setFrom: (s: string) => void;
  to: string; setTo: (s: string) => void;
  onApply: (mode: "all" | "day" | "week" | "month" | "custom") => void;
  data: { total: number; byType: { type: string; label: string; count: number }[] } | undefined;
}) {
  const total = data?.total ?? 0;
  const byType = data?.byType ?? [];
  const colors: Record<string, string> = {
    post: "#10b981",     // emerald
    comment: "#3b82f6",  // blue
    job: "#f59e0b",      // amber
    message: "#ec4899",  // pink
  };

  // 파이차트 - donut 형태 (stroke-dasharray 트릭)
  const r = 40;
  const C = 2 * Math.PI * r; // 둘레
  let cumulative = 0;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 p-4 space-y-4">
      <div>
        <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-2">
          신고 분석 기간 필터 (기본: 주)
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {[
            { key: "week", label: "주" },
            { key: "month", label: "월" },
            { key: "day", label: "일" },
            { key: "all", label: "전체" },
            { key: "custom", label: "직접선택" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => {
                const next = key as typeof range;
                setRange(next);
                if (next !== "custom") onApply(next);
              }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                range === key
                  ? "bg-emerald-500 text-white shadow-sm"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
            >{label}</button>
          ))}
        </div>
        {range === "custom" && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm" />
            <span className="text-sm text-zinc-400">~</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm" />
            <button onClick={() => onApply("custom")}
              disabled={!from || !to}
              className="px-4 py-1.5 rounded-lg bg-emerald-500 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed">조회</button>
          </div>
        )}
      </div>

      <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4">
        <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-200 mb-3">신고 분석</h3>
        {total === 0 ? (
          <p className="text-center py-8 text-xs text-zinc-400">기간 내 신고 내역이 없습니다</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-6 items-center">
            {/* 파이/도넛 차트 */}
            <div className="flex justify-center">
              <svg viewBox="0 0 100 100" className="w-40 h-40 -rotate-90">
                <circle cx="50" cy="50" r={r} fill="none" stroke="#f4f4f5" strokeWidth="18" className="dark:stroke-zinc-800" />
                {byType.map((t) => {
                  const pct = total > 0 ? t.count / total : 0;
                  if (pct === 0) return null;
                  const dash = pct * C;
                  const offset = -cumulative * C;
                  cumulative += pct;
                  return (
                    <circle
                      key={t.type}
                      cx="50" cy="50" r={r}
                      fill="none"
                      stroke={colors[t.type] || "#a1a1aa"}
                      strokeWidth="18"
                      strokeDasharray={`${dash} ${C - dash}`}
                      strokeDashoffset={offset}
                    />
                  );
                })}
                {/* 중앙 총계 텍스트 (회전 보정) */}
                <text x="50" y="50" textAnchor="middle" dominantBaseline="central"
                  fontSize="14" fontWeight="700" fill="#3f3f46"
                  className="dark:fill-zinc-100"
                  transform="rotate(90 50 50)">
                  {total.toLocaleString()}
                </text>
                <text x="50" y="62" textAnchor="middle" dominantBaseline="central"
                  fontSize="6" fill="#a1a1aa"
                  transform="rotate(90 50 50)">
                  총 신고
                </text>
              </svg>
            </div>
            {/* 카테고리별 리스트 */}
            <div className="space-y-2">
              {byType.map((t) => {
                const pct = total > 0 ? (t.count / total) * 100 : 0;
                return (
                  <div key={t.type} className="flex items-center gap-3">
                    <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: colors[t.type] || "#a1a1aa" }} />
                    <span className="flex-1 text-sm text-zinc-700 dark:text-zinc-300">{t.label}</span>
                    <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{t.count.toLocaleString()}건</span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 w-12 text-right">{pct.toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── 유입 분석: 일별 차트 ── */
function VisitDailyChart({ daily, total }: { daily: { date: string; count: number }[]; total: number }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const max = Math.max(1, ...daily.map((d) => d.count));
  const fmtDate = (s: string) => {
    const [, m, d] = s.split("-");
    return `${Number(m)}.${Number(d)}`;
  };
  return (
    <div>
      <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-200 mb-2">유입 수</h3>
      <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-3">
        {total.toLocaleString()}<span className="text-sm font-medium text-zinc-400 ml-1">회</span>
      </p>
      {daily.length === 0 ? (
        <p className="text-center py-8 text-xs text-zinc-400">데이터가 없습니다</p>
      ) : (
        <div className="relative h-32 px-1">
          {/* 막대 */}
          <div className="flex items-end gap-1 h-full">
            {daily.map((d, i) => (
              <div
                key={d.date}
                className="flex-1 flex flex-col items-center justify-end h-full cursor-pointer relative"
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
              >
                <div className={`w-full rounded-t-sm transition-all ${
                  hoverIdx === i
                    ? "bg-emerald-500 dark:bg-emerald-500"
                    : "bg-emerald-400 dark:bg-emerald-600"
                }`}
                  style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count > 0 ? 2 : 0 }}
                />
              </div>
            ))}
          </div>
          {/* 툴팁 (절대 위치, 가장자리 잘림 방지) */}
          {hoverIdx !== null && (() => {
            const total = daily.length;
            const leftPct = ((hoverIdx + 0.5) / total) * 100;
            const isLeft = hoverIdx <= 1;
            const isRight = hoverIdx >= total - 2;
            const transform = isLeft ? "translateX(0)" : isRight ? "translateX(-100%)" : "translateX(-50%)";
            return (
              <div
                className="absolute -top-1 -translate-y-full px-2 py-1 rounded-md bg-emerald-50 border border-emerald-200 dark:bg-emerald-950 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold whitespace-nowrap pointer-events-none shadow-sm z-10"
                style={{ left: `${leftPct}%`, transform }}
              >
                {fmtDate(daily[hoverIdx].date)} · {daily[hoverIdx].count}회
              </div>
            );
          })()}
        </div>
      )}
      <div className="flex gap-1 mt-2 px-1">
        {daily.map((d, i) => (
          <span key={d.date}
            className={`flex-1 text-center text-[10px] transition-colors ${
              hoverIdx === i ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-zinc-400"
            }`}
          >{fmtDate(d.date)}</span>
        ))}
      </div>
    </div>
  );
}

/* ── 유입 분석: 채널 ── */
function VisitChannels({ channels }: { channels: { name: string; count: number; percent: number }[] }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-200 mb-3">유입 채널</h3>
      {channels.length === 0 ? (
        <p className="text-center py-8 text-xs text-zinc-400">데이터가 없습니다</p>
      ) : (
        <div className="space-y-1.5">
          {channels.map((c, i) => (
            <div
              key={c.name}
              title={`${c.name}: ${c.count.toLocaleString()}회 (${c.percent.toFixed(2)}%)`}
              className="relative rounded-lg overflow-hidden cursor-help"
            >
              <div className="absolute inset-y-0 left-0 bg-emerald-50 dark:bg-emerald-950/30" style={{ width: `${c.percent}%` }} />
              <div className="relative flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2.5">
                  <span className={`text-xs font-bold ${i === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-400"}`}>{i + 1}</span>
                  <span className={`text-sm ${i === 0 ? "font-bold text-emerald-700 dark:text-emerald-400" : "text-zinc-700 dark:text-zinc-300"}`}>{c.name}</span>
                </div>
                <span className={`text-sm font-bold ${i === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-700 dark:text-zinc-200"}`}>
                  {c.percent.toFixed(2)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 유입 분석: 시간/요일별 ── */
function VisitHourlyChart({ hourly, weekday }: { hourly: { hour: number; count: number }[]; weekday: { weekday: number; count: number }[] }) {
  const [mode, setMode] = useState<"hour" | "weekday">("hour");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const data = mode === "hour"
    ? hourly.map((d) => ({ label: `${d.hour}시`, count: d.count }))
    : weekday.map((d) => ({ label: ["일","월","화","수","목","금","토"][d.weekday], count: d.count }));
  const max = Math.max(1, ...data.map((d) => d.count));
  // 차트 영역(plotting) 과 라벨 영역(label band) 분리해서 라벨이 데이터 포인트와 정확히 정렬되게
  const W = 320, H = 130, padX = 14, padTop = 14, padBottom = 24;
  const plotH = H - padTop - padBottom;
  const xStep = data.length > 1 ? (W - padX * 2) / (data.length - 1) : 0;
  const pointsArr = data.map((d, i) => {
    const x = padX + i * xStep;
    const y = padTop + plotH - ((d.count / max) * plotH);
    return { x, y, ...d };
  });
  const polyPoints = pointsArr.map((p) => `${p.x},${p.y}`).join(" ");
  const labelY = padTop + plotH + 16; // 라벨 baseline

  // mode 바뀌면 hover 초기화
  useEffect(() => { setHoverIdx(null); }, [mode]);

  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || data.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const xInSvg = xRatio * W;
    let nearest = 0, minDist = Infinity;
    pointsArr.forEach((p, i) => {
      const d = Math.abs(p.x - xInSvg);
      if (d < minDist) { minDist = d; nearest = i; }
    });
    setHoverIdx(nearest);
  };

  const hovered = hoverIdx !== null ? pointsArr[hoverIdx] : null;
  // 툴팁 위치 — 좌우 가장자리 잘리지 않게 보정
  let tooltipX = 0, tooltipAnchor: "start" | "middle" | "end" = "middle";
  if (hovered) {
    tooltipX = hovered.x;
    if (hovered.x < 30) { tooltipAnchor = "start"; }
    else if (hovered.x > W - 30) { tooltipAnchor = "end"; }
  }

  // 표시할 라벨 인덱스 — 시간 모드는 0/3/6/9/12/15/18/21 만, 요일 모드는 전부
  const labelIdxSet = mode === "hour"
    ? new Set([0, 3, 6, 9, 12, 15, 18, 21])
    : new Set([0, 1, 2, 3, 4, 5, 6]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-200">시간·요일별</h3>
        <div className="flex gap-1 rounded-full bg-zinc-100 dark:bg-zinc-800 p-0.5">
          <button onClick={() => setMode("hour")}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${mode === "hour" ? "bg-zinc-900 text-white" : "text-zinc-500"}`}>시간별</button>
          <button onClick={() => setMode("weekday")}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${mode === "weekday" ? "bg-zinc-900 text-white" : "text-zinc-500"}`}>요일별</button>
        </div>
      </div>
      {data.every((d) => d.count === 0) ? (
        <p className="text-center py-8 text-xs text-zinc-400">데이터가 없습니다</p>
      ) : (
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="w-full h-32 cursor-crosshair block"
          onMouseMove={onMouseMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <rect x="0" y="0" width={W} height={H} fill="transparent" pointerEvents="all" />
          <polyline fill="none" stroke="#10b981" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={polyPoints} />
          {pointsArr.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={hoverIdx === i ? 3.5 : 2} fill="#10b981" />
          ))}
          {/* x축 라벨 — 데이터 포인트와 정확히 같은 x 좌표 */}
          {pointsArr.map((p, i) => labelIdxSet.has(i) && (
            <text
              key={`l-${i}`}
              x={p.x}
              y={labelY}
              textAnchor="middle"
              fontSize="10"
              fill="#a1a1aa"
              style={{ pointerEvents: "none" }}
            >
              {p.label}
            </text>
          ))}
          {hovered && (
            <>
              {/* 가이드 세로선 */}
              <line x1={hovered.x} y1={padTop} x2={hovered.x} y2={padTop + plotH} stroke="#10b981" strokeWidth="1" strokeDasharray="2 2" opacity="0.4" />
              {/* 툴팁 텍스트 */}
              <text
                x={tooltipX}
                y={Math.max(hovered.y - 8, padTop + 4)}
                textAnchor={tooltipAnchor}
                fontSize="11"
                fontWeight="700"
                fill="#065f46"
                className="dark:fill-emerald-300"
                style={{ pointerEvents: "none" }}
              >
                {hovered.label} · {hovered.count}회
              </text>
            </>
          )}
        </svg>
      )}
    </div>
  );
}

/* ── USER 탭 보조 컴포넌트 ── */
function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col rounded-md bg-zinc-50 px-3 py-2 dark:bg-zinc-800/50">
      <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className={`mt-0.5 text-sm break-all ${mono ? "font-mono text-[11px]" : ""} text-zinc-800 dark:text-zinc-100`}>{value}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-800/50">
      <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-0.5 text-base font-bold text-cyan-600 dark:text-cyan-400">{value}</p>
    </div>
  );
}

function RecentList({ title, items }: { title: string; items: { id: number; label: string; time: string; url: string | null }[] }) {
  const [expanded, setExpanded] = useState(false);
  const INITIAL = 5;
  const visible = expanded ? items : items.slice(0, INITIAL);
  const hiddenCount = items.length - INITIAL;
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-200">{title} ({items.length})</h3>
        {items.length > INITIAL && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="rounded-md bg-cyan-50 px-2 py-1 text-[10px] font-bold text-cyan-700 hover:bg-cyan-100 dark:bg-cyan-950/40 dark:text-cyan-300 dark:hover:bg-cyan-950/60"
          >
            {expanded ? "− 접기" : `+ 더보기 (${hiddenCount})`}
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-zinc-400">없음</p>
      ) : (
        <ul className="space-y-1.5">
          {visible.map((it) => (
            <li key={it.id} className="flex items-start gap-2 text-xs">
              <span className="shrink-0 text-[10px] text-zinc-400">{new Date(it.time).toLocaleDateString("ko-KR")}</span>
              {it.url ? (
                <a
                  href={it.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 truncate text-cyan-700 hover:underline dark:text-cyan-400"
                >
                  {it.label}
                </a>
              ) : (
                <span className="flex-1 truncate text-zinc-700 dark:text-zinc-300">{it.label}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── 유입 분석: 키워드 ── */
function VisitKeywords({ keywords }: { keywords: { keyword: string; count: number; percent: number }[] }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 p-4">
      <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-200 mb-3">유입 키워드</h3>
      {keywords.length === 0 ? (
        <p className="text-center py-8 text-xs text-zinc-400">데이터가 없습니다</p>
      ) : (
        <div className="space-y-1.5">
          {keywords.map((k, i) => (
            <div key={k.keyword} className="relative rounded-lg overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-emerald-50 dark:bg-emerald-950/30" style={{ width: `${k.percent}%` }} />
              <div className="relative flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`text-xs font-bold shrink-0 ${i === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-400"}`}>{i + 1}</span>
                  <span className={`text-sm truncate ${i === 0 ? "font-bold text-emerald-700 dark:text-emerald-400" : "text-zinc-700 dark:text-zinc-300"}`}>{k.keyword}</span>
                </div>
                <span className={`text-sm font-bold shrink-0 ml-2 ${i === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-700 dark:text-zinc-200"}`}>
                  {k.percent.toFixed(2)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
