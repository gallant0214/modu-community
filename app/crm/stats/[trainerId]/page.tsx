"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useAuth } from "@/app/components/auth-provider";
import { ROLE_LABEL, formatWon, formatPhone } from "../../_components/crm-labels";
import { crmInputClass } from "../../_components/crm-modal";

type Tab = "revenue" | "members" | "sessions" | "cancel";
type Period = "this_month" | "last_month" | "this_year" | "custom";

// 기간 → { from, to } (KST 기준 YYYY-MM-DD)
function periodRange(period: Period, customFrom: string, customTo: string): { from: string; to: string } {
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ymd = (yy: number, mm: number, dd: number) => `${yy}-${pad(mm + 1)}-${pad(dd)}`;
  if (period === "this_month") {
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return { from: ymd(y, m, 1), to: ymd(y, m, last) };
  }
  if (period === "last_month") {
    const lm = new Date(Date.UTC(y, m - 1, 1));
    const yy = lm.getUTCFullYear();
    const mm = lm.getUTCMonth();
    const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
    return { from: ymd(yy, mm, 1), to: ymd(yy, mm, last) };
  }
  if (period === "this_year") return { from: `${y}-01-01`, to: `${y}-12-31` };
  return { from: customFrom, to: customTo };
}

interface StaffMember {
  id: number;
  display_name: string;
  role: string;
  email: string | null;
  phone: string | null;
}

export default function TrainerStatsDetailPage() {
  const params = useParams();
  const trainerId = Number(params.trainerId);
  const { getIdToken } = useAuth();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(searchParams.get("tab") === "cancel" ? "cancel" : "revenue");
  const [member, setMember] = useState<StaffMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch(`/api/crm/staff/${trainerId}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setMember(data.member);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken, trainerId]);

  useEffect(() => {
    if (trainerId) load();
  }, [trainerId, load]);

  return (
    <div className="px-5 md:px-8 pt-2 pb-6 md:pt-3 md:pb-8 max-w-6xl mx-auto">
      <Link
        href="/crm/stats"
        className="inline-flex items-center gap-1 text-[13px] text-[#6B5D47] dark:text-zinc-400 hover:text-[#3A342A]"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        통계 목록
      </Link>

      <header className="mt-3 mb-5">
        {loading ? (
          <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>
        ) : !member ? (
          <div className="text-[13px] text-red-700">{error || "강사 정보를 찾을 수 없습니다."}</div>
        ) : (
          <>
            <h1 className="text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
              {member.display_name}
              <span className="ml-2 text-[12px] text-[#A89B80]">
                · {ROLE_LABEL[member.role] ?? member.role}
              </span>
            </h1>
            <div className="mt-1 text-[12.5px] text-[#8C8270] dark:text-zinc-500">
              {member.phone ? formatPhone(member.phone) : ""}
              {member.email && (
                <>
                  {member.phone && " · "}
                  {member.email}
                </>
              )}
            </div>
          </>
        )}
      </header>

      <div className="mb-5 flex gap-1.5 border-b border-[#E8E0D0] dark:border-zinc-800 overflow-x-auto">
        <TabBtn active={tab === "revenue"} onClick={() => setTab("revenue")}>
          매출
        </TabBtn>
        <TabBtn active={tab === "members"} onClick={() => setTab("members")}>
          담당 회원
        </TabBtn>
        <TabBtn active={tab === "sessions"} onClick={() => setTab("sessions")}>
          수업 내역
        </TabBtn>
        <TabBtn active={tab === "cancel"} onClick={() => setTab("cancel")}>
          취소 내역
        </TabBtn>
      </div>

      {tab === "revenue" && <RevenueTab />}
      {tab === "members" && <MembersTab />}
      {tab === "sessions" && <SessionsTab />}
      {tab === "cancel" && <CancellationsTab trainerId={trainerId} />}
    </div>
  );
}

/* ─── 취소 내역 탭 ────────────────────────────── */

interface CancelLog {
  id: number;
  member_id: number;
  member_name: string;
  starts_at: string;
  status: string;
  cancelled_reason: string | null;
  cancelled_at: string | null;
}
interface CancelResp {
  total: number;
  cancelled: number;
  noshow: number;
  by_reason: { trainer: number; member: number; other: number };
  log: CancelLog[];
}

function CancellationsTab({ trainerId }: { trainerId: number }) {
  const { getIdToken } = useAuth();
  const [period, setPeriod] = useState<Period>("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [data, setData] = useState<CancelResp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { from, to } = periodRange(period, customFrom, customTo);
      if (!from || !to) return;
      setLoading(true);
      try {
        const token = await getIdToken();
        if (!token) return;
        const res = await fetch(
          `/api/crm/stats/cancellations?trainer_member_id=${trainerId}&from=${from}&to=${to}`,
          { headers: { authorization: `Bearer ${token}` }, cache: "no-store" }
        );
        if (res.ok) setData(await res.json());
      } finally {
        setLoading(false);
      }
    })();
  }, [getIdToken, trainerId, period, customFrom, customTo]);

  const pct = (n: number) => (data && data.total > 0 ? Math.round((n / data.total) * 100) : 0);

  return (
    <>
      <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100">
            취소 사유별 집계
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[#A89B80]">조회 기간</span>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              className={crmInputClass}
              style={{ width: 120 }}
            >
              <option value="this_month">이번 달</option>
              <option value="last_month">지난 달</option>
              <option value="this_year">올해</option>
              <option value="custom">직접 선택</option>
            </select>
          </div>
        </div>
        {period === "custom" && (
          <div className="flex items-center gap-1.5 mb-3">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className={crmInputClass} style={{ width: 150 }} />
            <span className="text-[#A89B80]">~</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className={crmInputClass} style={{ width: 150 }} />
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <CancelKpi label="회원 요청" count={data?.by_reason.member ?? 0} pct={pct(data?.by_reason.member ?? 0)} tone="member" />
          <CancelKpi label="강사 요청" count={data?.by_reason.trainer ?? 0} pct={pct(data?.by_reason.trainer ?? 0)} tone="trainer" />
          <CancelKpi label="전체 취소·노쇼" count={data?.total ?? 0} pct={100} tone="total" />
        </div>
        {(data?.by_reason.other ?? 0) > 0 && (
          <div className="mt-2 text-[11.5px] text-[#A89B80]">
            · 사유 미기록 {data?.by_reason.other}건 ({pct(data?.by_reason.other ?? 0)}%)
          </div>
        )}
        <div className="mt-2 text-[11.5px] text-[#8C8270]">
          취소 {data?.cancelled ?? 0}건 · 노쇼 {data?.noshow ?? 0}건
        </div>
      </section>

      <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5">
        <h2 className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-3">
          취소 로그 ({data?.log.length ?? 0}건)
        </h2>
        {loading && !data ? (
          <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>
        ) : (data?.log.length ?? 0) === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
            해당 기간 취소·노쇼 내역이 없어요.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#E8E0D0] dark:border-zinc-800">
            <table className="w-full text-[13px]">
              <thead className="bg-[#FBF7EB] dark:bg-zinc-900/80 text-[#6B5D47] dark:text-zinc-400">
                <tr>
                  <th className="text-left font-medium px-3 py-2.5">회원</th>
                  <th className="text-left font-medium px-3 py-2.5">수업 일시</th>
                  <th className="text-left font-medium px-3 py-2.5">구분</th>
                  <th className="text-left font-medium px-3 py-2.5">사유</th>
                </tr>
              </thead>
              <tbody>
                {(data?.log ?? []).map((l) => (
                  <tr key={l.id} className="border-t border-[#E8E0D0]/70 dark:border-zinc-800">
                    <td className="px-3 py-2.5">
                      <Link href={`/crm/members/${l.member_id}`} className="font-medium text-[#2A251D] dark:text-zinc-100 hover:text-[#6B7B3A]">
                        {l.member_name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-[#6B5D47] dark:text-zinc-400">{formatKstDateTime(l.starts_at)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${l.status === "noshow" ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" : "bg-[#F5F0E5] dark:bg-zinc-800 text-[#8C8270]"}`}>
                        {l.status === "noshow" ? "노쇼" : "취소"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {l.cancelled_reason ? (
                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${l.cancelled_reason === "회원 요청" ? "bg-[#3E7C8C]/10 text-[#3E7C8C] dark:text-cyan-300" : "bg-[#6B7B3A]/10 text-[#6B7B3A] dark:text-[#A8B87A]"}`}>
                          {l.cancelled_reason}
                        </span>
                      ) : (
                        <span className="text-[#A89B80]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function CancelKpi({ label, count, pct, tone }: { label: string; count: number; pct: number; tone: "member" | "trainer" | "total" }) {
  const color =
    tone === "member" ? "text-[#3E7C8C] dark:text-cyan-300" : tone === "trainer" ? "text-[#6B7B3A] dark:text-[#A8B87A]" : "text-[#2A251D] dark:text-zinc-100";
  return (
    <div className="rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FBF7EB]/40 dark:bg-zinc-950/40 px-3 py-3">
      <div className="text-[11.5px] text-[#8C8270] dark:text-zinc-500">{label}</div>
      <div className={`mt-1 text-[20px] leading-none font-bold ${color}`}>
        {count.toLocaleString()}
        <span className="text-[11px] ml-0.5 font-medium text-[#8C8270]">건</span>
      </div>
      <div className="mt-1 text-[12px] font-semibold text-[#8C8270]">{pct}%</div>
    </div>
  );
}

function formatKstDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    const k = new Date(d.getTime() + 9 * 3600 * 1000);
    return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, "0")}-${String(k.getUTCDate()).padStart(2, "0")} ${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}

/* ─── 매출 탭 ────────────────────────────── */

function RevenueTab() {
  const [period, setPeriod] = useState<Period>("this_month");

  return (
    <>
      {/* 전체 매출 */}
      <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5 mb-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
          <h2 className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100">
            전체 매출 <span className="text-[11.5px] text-[#A89B80] font-normal">(매출 적용 금액)</span>
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[#A89B80]">조회 기간</span>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              className={crmInputClass}
              style={{ width: 120 }}
            >
              <option value="this_month">이번 달</option>
              <option value="last_month">지난 달</option>
              <option value="this_year">올해</option>
              <option value="custom">직접 선택</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <RevenueKpi label="매출 적용 금액" value={0} />
          <RevenueKpi label="잔여 미수금" value={0} muted />
        </div>
      </section>

      {/* 카테고리별 매출 5종 */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        {CATEGORIES.map((c) => (
          <div
            key={c.key}
            className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5"
          >
            <h3 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-3">
              {c.label}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <RevenueKpi label="매출 적용 금액" value={0} small />
              <RevenueKpi label="잔여 미수금" value={0} small muted />
            </div>
          </div>
        ))}
      </section>

      {/* 매출 내역 */}
      <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <h2 className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100">
            매출 내역 (0건)
          </h2>
          <select className={`${crmInputClass} ml-auto`} style={{ maxWidth: 160 }}>
            <option>전체 상품</option>
            <option>회원권</option>
            <option>그룹 수업</option>
            <option>개인 레슨</option>
            <option>락커</option>
            <option>운동 용품</option>
          </select>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[#E8E0D0] dark:border-zinc-800">
          <table className="w-full text-[13px]">
            <thead className="bg-[#FBF7EB] dark:bg-zinc-900/80 text-[#6B5D47] dark:text-zinc-400">
              <tr>
                <Th>결제일</Th>
                <Th>회원명</Th>
                <Th>연락처</Th>
                <Th>결제 상품</Th>
                <Th>결제 금액</Th>
                <Th>비고</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={6} className="px-3 py-12 text-center">
                  <div className="text-[13.5px] text-[#8C8270] dark:text-zinc-400">
                    데이터가 없어요
                  </div>
                  <div className="mt-1 text-[12px] text-[#A89B80] dark:text-zinc-500">
                    보여드릴 매출 내역이 없어요.
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

const CATEGORIES = [
  { key: "membership", label: "회원권 매출" },
  { key: "group", label: "그룹 수업 매출" },
  { key: "personal", label: "개인 레슨 매출" },
  { key: "locker", label: "락커 매출" },
  { key: "goods", label: "운동 용품 매출" },
];

function RevenueKpi({
  label,
  value,
  small,
  muted,
}: {
  label: string;
  value: number;
  small?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="px-3.5 py-2.5 rounded-xl border border-[#E8E0D0]/70 dark:border-zinc-800 bg-[#FBF7EB]/40 dark:bg-zinc-900/40">
      <div className="text-[11.5px] text-[#A89B80] dark:text-zinc-500">{label}</div>
      <div
        className={`mt-0.5 font-bold ${small ? "text-[15px]" : "text-[18px]"} ${muted ? "text-[#A89B80] dark:text-zinc-400" : "text-[#2A251D] dark:text-zinc-100"}`}
      >
        {formatWon(value)} 원
      </div>
    </div>
  );
}

/* ─── 담당 회원 탭 ────────────────────────────── */

function MembersTab() {
  return (
    <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5">
      <h2 className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-3">
        총 0명
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-2 mb-3">
        <div>
          <div className="text-[11.5px] text-[#A89B80] mb-1">필터</div>
          <select className={crmInputClass}>
            <option>회원 전체</option>
            <option>활성</option>
            <option>휴면</option>
          </select>
        </div>
        <div>
          <div className="text-[11.5px] text-[#A89B80] mb-1">검색</div>
          <input
            type="text"
            className={crmInputClass}
            placeholder="이름 및 연락처로 검색"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#E8E0D0] dark:border-zinc-800">
        <table className="w-full text-[13px]">
          <thead className="bg-[#FBF7EB] dark:bg-zinc-900/80 text-[#6B5D47] dark:text-zinc-400">
            <tr>
              <Th>번호</Th>
              <Th>이름</Th>
              <Th>PT 여부</Th>
              <Th>앱 사용</Th>
              <Th>개인 레슨 경험</Th>
              <Th>나이</Th>
              <Th>성별</Th>
              <Th>연락처</Th>
              <Th>가입일</Th>
              <Th>만기일</Th>
              <Th>최근 구매 상품</Th>
              <Th>총 결제 금액</Th>
              <Th>총 미수금</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={13} className="px-3 py-12 text-center">
                <div className="text-[13.5px] text-[#8C8270] dark:text-zinc-400">
                  데이터가 없어요
                </div>
                <div className="mt-1 text-[12px] text-[#A89B80] dark:text-zinc-500">
                  아직 담당 회원이 없어요.
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ─── 수업 내역 탭 ────────────────────────────── */

type SessionKind = "personal" | "group";

function SessionsTab() {
  const [kind, setKind] = useState<SessionKind>("personal");
  const [period, setPeriod] = useState<Period>("this_month");

  return (
    <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5">
      <h2 className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-3">
        수업 내역
      </h2>

      <div className="flex gap-1.5 mb-4 border-b border-[#E8E0D0]/60 dark:border-zinc-800">
        {[
          { key: "personal" as const, label: "개인 레슨" },
          { key: "group" as const, label: "그룹 수업" },
        ].map((k) => (
          <button
            key={k.key}
            onClick={() => setKind(k.key)}
            className={`px-3 py-1.5 -mb-px text-[12.5px] font-medium border-b-2 transition-colors
              ${kind === k.key
                ? "border-[#6B7B3A] text-[#6B7B3A] dark:text-[#A8B87A]"
                : "border-transparent text-[#8C8270] hover:text-[#3A342A]"
              }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <span className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">
          총 수업 횟수 (0회)
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11.5px] text-[#A89B80]">필터</span>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            className={crmInputClass}
            style={{ width: 120 }}
          >
            <option value="this_month">이번 달</option>
            <option value="last_month">지난 달</option>
            <option value="this_year">올해</option>
            <option value="custom">직접 선택</option>
          </select>
          <select className={crmInputClass} style={{ width: 130 }}>
            <option>{kind === "personal" ? "개인 레슨 전체" : "그룹 수업 전체"}</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#E8E0D0] dark:border-zinc-800">
        <table className="w-full text-[13px]">
          <thead className="bg-[#FBF7EB] dark:bg-zinc-900/80 text-[#6B5D47] dark:text-zinc-400">
            <tr>
              <Th>번호</Th>
              <Th>이름</Th>
              <Th>나이</Th>
              <Th>성별</Th>
              <Th>연락처</Th>
              <Th>상품명</Th>
              <Th>계약 수 + 서비스 수 (총 계약)</Th>
              <Th>사용 완료</Th>
              <Th>잔여</Th>
              <Th>수업 횟수</Th>
              <Th>세부사항</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={11} className="px-3 py-12 text-center">
                <div className="text-[13.5px] text-[#8C8270] dark:text-zinc-400">
                  데이터가 없어요
                </div>
                <div className="mt-1 text-[12px] text-[#A89B80] dark:text-zinc-500">
                  수업 내역이 존재하지 않아요.
                  <br />
                  필터를 다시 설정해 보세요.
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-center gap-3 text-[12.5px] text-[#3A342A] dark:text-zinc-300">
        <span className="font-medium">1</span>
      </div>
    </section>
  );
}

/* ─── 공통 ────────────────────────────── */

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 -mb-px text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap
        ${active
          ? "border-[#6B7B3A] text-[#6B7B3A] dark:text-[#A8B87A]"
          : "border-transparent text-[#8C8270] dark:text-zinc-500 hover:text-[#3A342A] dark:hover:text-zinc-300"
        }`}
    >
      {children}
    </button>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left font-medium px-3 py-2.5 whitespace-nowrap">{children}</th>;
}
