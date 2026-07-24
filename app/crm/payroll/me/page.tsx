"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/auth-provider";
import { formatWon } from "../../_components/crm-labels";
import { crmInputClass } from "../../_components/crm-modal";

type Preset = "this_month" | "last_month" | "custom";

interface Payroll {
  ym: string;
  passes: {
    id: number;
    issue_type: string;
    price_won: number;
    total_sessions: number;
    issued_at: string;
    status: string;
    vat_included: boolean;
  }[];
  breakdown: { new: number; renewal: number; trial: number; service: number; total: number };
  payout: { new: number; renewal: number; trial: number; total: number };
  sessionCount: number;
  commission: { base: number; effective_rate: number; payout: number; type: string; rate: number };
  base_salary: number;
  achieved_bonuses: { metric: string; gte: number; reward_type?: string; bonus_won?: number; bonus_percent?: number }[];
  bonus_payout: number;
  cash_pay_enabled: boolean;
  cash_pay: number;
  total_pay: number;
  employment_type: string | null;
  is_freelance: boolean;
  withholding_rate: number;
  withholding_tax: number;
  net_pay: number;
}

interface ReservationSummary {
  scheduled: number;
  attended: number;
  cancelled: number;
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const monthStart = (d = new Date()) => `${d.toISOString().slice(0, 7)}-01`;
const monthEnd = (d = new Date()) => {
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return next.toISOString().slice(0, 10);
};
const lastMonthRange = () => {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const last = new Date(now.getFullYear(), now.getMonth(), 0);
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
};

export default function SoloPayrollPage() {
  const { getIdToken } = useAuth();
  const [myMemberId, setMyMemberId] = useState<number | null>(null);
  const [preset, setPreset] = useState<Preset>("this_month");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayISO());
  const [data, setData] = useState<Payroll | null>(null);
  const [reservations, setReservations] = useState<ReservationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch("/api/crm/bootstrap", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) {
        const d = await res.json();
        setMyMemberId(d.centerMemberId ?? null);
      }
    })();
  }, [getIdToken]);

  useEffect(() => {
    if (preset === "this_month") {
      setFrom(monthStart());
      setTo(monthEnd());
    } else if (preset === "last_month") {
      const r = lastMonthRange();
      setFrom(r.from);
      setTo(r.to);
    }
  }, [preset]);

  const load = useCallback(async () => {
    if (!myMemberId) return;
    setLoading(true);
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없어요");
      const q = new URLSearchParams({ from, to });
      const [payRes, resvRes] = await Promise.all([
        fetch(`/api/crm/payroll/${myMemberId}?${q}`, {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
        fetch(`/api/crm/reservations?from=${from}&to=${to}`, {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
      ]);
      const payData = await payRes.json();
      if (!payRes.ok) throw new Error(payData?.error || "수업료 조회 실패");
      setData(payData);
      if (resvRes.ok) {
        const rd = await resvRes.json();
        const list = (rd.reservations ?? rd.items ?? []) as { status: string }[];
        setReservations({
          scheduled: list.filter((r) => r.status === "booked" || r.status === "requested").length,
          attended: list.filter((r) => r.status === "attended").length,
          cancelled: list.filter((r) => r.status === "cancelled" || r.status === "no_show").length,
        });
      } else {
        setReservations(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [myMemberId, from, to, getIdToken]);

  useEffect(() => {
    load();
  }, [load]);

  const isThisMonthRange = useMemo(() => {
    return from === monthStart() && to === monthEnd();
  }, [from, to]);

  const expectedRest = useMemo(() => {
    // 이번달 잔여 예약 기반 예상 매출 = 예약 확정 세션 수 × 세션당 평균 수업료(발급된 pass 평균)
    if (!data || !reservations || !isThisMonthRange) return null;
    const remainingSessions = reservations.scheduled;
    if (remainingSessions === 0) return null;
    const totalSessions = data.passes.reduce((s, p) => s + (p.total_sessions ?? 0), 0);
    const totalRevenue = data.passes.reduce(
      (s, p) => s + (p.vat_included ? Math.round((p.price_won ?? 0) / 1.1) : p.price_won ?? 0),
      0
    );
    const avgPerSession = totalSessions > 0 ? Math.round(totalRevenue / totalSessions) : 0;
    if (avgPerSession === 0) return null;
    const expectedRevenue = avgPerSession * remainingSessions;
    const expectedPayout = Math.round((expectedRevenue * (data.commission.effective_rate || 0)) / 100);
    return { remainingSessions, avgPerSession, expectedRevenue, expectedPayout };
  }, [data, reservations, isThisMonthRange]);

  return (
    <div className="px-5 md:px-8 pt-3 pb-8 max-w-5xl mx-auto">
      <header className="mb-4">
        <h1 className="text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">내 수업료</h1>
        <p className="mt-1 text-[12.5px] text-[#8C8270] dark:text-zinc-500">
          기간 내 발급된 수강권과 예약을 바탕으로 산정됩니다. 정산 규칙은 센터 설정 기준이에요.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(
          [
            { key: "this_month", label: "이번달" },
            { key: "last_month", label: "지난달" },
            { key: "custom", label: "기간 지정" },
          ] as { key: Preset; label: string }[]
        ).map((p) => (
          <button
            key={p.key}
            onClick={() => setPreset(p.key)}
            className={`px-3 py-1.5 rounded-lg text-[12.5px] font-semibold border transition-colors
              ${preset === p.key
                ? "border-[#6B7B3A] bg-[#6B7B3A]/10 text-[#6B7B3A] dark:text-[#A8B87A]"
                : "border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300"
              }`}
          >
            {p.label}
          </button>
        ))}
        {preset === "custom" && (
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={`${crmInputClass} w-[140px]`}
            />
            <span className="text-[12px] text-[#A89B80]">~</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={`${crmInputClass} w-[140px]`}
            />
          </div>
        )}
        <div className="ml-auto text-[12px] text-[#6B5D47] dark:text-zinc-400">
          {from} ~ {to}
        </div>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading || !data ? (
        <div className="py-12 text-center text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : (
        <>
          <section className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
            <Kpi
              label="실지급액"
              value={`${formatWon(data.net_pay)}원`}
              hint={data.is_freelance ? "3.3% 원천징수 후 실수령" : "총 지급액"}
              tone="green"
            />
            <Kpi
              label="이번 기간 매출"
              value={`${formatWon(data.commission.base)}원`}
              hint={`발급 ${data.passes.length}건 · ${data.sessionCount}회`}
            />
            <Kpi
              label="수업료 (커미션)"
              value={`${formatWon(data.commission.payout)}원`}
              hint={`요율 ${data.commission.effective_rate}%`}
            />
          </section>

          {expectedRest && (
            <section className="mb-5 rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900/60 p-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-[14px] font-bold text-[#2A251D] dark:text-zinc-100">
                  이번달 예약 기반 예상 추가 수업료
                </h2>
                <span className="text-[11px] text-[#A89B80]">확정 예약 × 세션당 평균 요율</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[13px]">
                <MiniStat label="확정 예약" value={`${expectedRest.remainingSessions}회`} />
                <MiniStat label="세션당 평균 수업료" value={`${formatWon(expectedRest.avgPerSession)}원`} />
                <MiniStat label="예상 추가 매출" value={`${formatWon(expectedRest.expectedRevenue)}원`} />
                <MiniStat
                  label="예상 추가 수업료"
                  value={`${formatWon(expectedRest.expectedPayout)}원`}
                  tone="green"
                />
              </div>
            </section>
          )}

          <section className="mb-5 rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
            <h2 className="text-[14px] font-bold text-[#2A251D] dark:text-zinc-100 mb-3">지급 내역</h2>
            <div className="space-y-1.5 text-[13px]">
              <Row label="기본급" value={`${formatWon(data.base_salary)}원`} />
              <Row label="수업료 (커미션)" value={`${formatWon(data.commission.payout)}원`} />
              {data.bonus_payout > 0 && (
                <Row label="성과급" value={`${formatWon(data.bonus_payout)}원`} sub={data.achieved_bonuses.map((b) => `${b.metric === "sessions" ? "진행세션" : "매출"} ${b.gte}${b.metric === "sessions" ? "회" : "원"} 달성`).join(" · ")} />
              )}
              {data.cash_pay_enabled && data.cash_pay > 0 && (
                <Row label="현금 지급" value={`${formatWon(data.cash_pay)}원`} sub="원천징수 제외" />
              )}
              <div className="pt-2 mt-2 border-t border-[#E8E0D0] dark:border-zinc-800">
                <Row label="총 지급액" value={`${formatWon(data.total_pay)}원`} bold />
                {data.is_freelance && (
                  <Row
                    label={`원천징수 (${(data.withholding_rate * 100).toFixed(1)}%)`}
                    value={`-${formatWon(data.withholding_tax)}원`}
                    tone="red"
                  />
                )}
                <Row label="실지급액" value={`${formatWon(data.net_pay)}원`} bold tone="green" />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
            <h2 className="text-[14px] font-bold text-[#2A251D] dark:text-zinc-100 mb-3">
              발급 수강권 ({data.passes.length}건)
            </h2>
            {data.passes.length === 0 ? (
              <div className="py-6 text-center text-[13px] text-[#8C8270]">
                이 기간에 발급된 수강권이 없어요.
              </div>
            ) : (
              <div className="divide-y divide-[#E8E0D0] dark:divide-zinc-800 text-[13px]">
                {data.passes.map((p) => (
                  <div key={p.id} className="py-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[12.5px] text-[#3A342A] dark:text-zinc-300">
                        발급 {p.issued_at.slice(0, 10)} · {p.total_sessions}회
                        <span className="ml-2 text-[11px] text-[#A89B80]">{issueTypeLabel(p.issue_type)}</span>
                      </div>
                    </div>
                    <div className="text-[13px] font-semibold text-[#2A251D] dark:text-zinc-100">
                      {formatWon(p.price_won)}원
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="mt-4 flex gap-2">
            <Link
              href="/crm/schedule"
              className="px-4 py-2.5 rounded-lg bg-[#6B7B3A] text-white text-[13px] font-semibold hover:bg-[#5a6932]"
            >
              스케줄 관리 →
            </Link>
            <Link
              href="/crm/passes"
              className="px-4 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13px] font-semibold text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
            >
              수강권 관리 →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function issueTypeLabel(t: string) {
  if (t === "new") return "신규";
  if (t === "renewal") return "재등록";
  if (t === "trial") return "체험";
  if (t === "service") return "서비스";
  return t;
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "green";
}) {
  return (
    <div className="rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
      <div className="text-[11.5px] text-[#8C8270] dark:text-zinc-500 font-semibold uppercase tracking-wide">
        {label}
      </div>
      <div
        className={`mt-1 text-[22px] font-extrabold leading-tight ${
          tone === "green" ? "text-[#3D6A2E] dark:text-emerald-300" : "text-[#2A251D] dark:text-zinc-100"
        }`}
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-[11.5px] text-[#A89B80]">{hint}</div>}
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "green" }) {
  return (
    <div>
      <div className="text-[11px] text-[#A89B80]">{label}</div>
      <div
        className={`mt-0.5 font-bold ${
          tone === "green" ? "text-[#3D6A2E] dark:text-emerald-300" : "text-[#2A251D] dark:text-zinc-100"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  sub,
  bold,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  bold?: boolean;
  tone?: "green" | "red";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div>
        <div className={`text-[13px] ${bold ? "font-bold text-[#2A251D] dark:text-zinc-100" : "text-[#3A342A] dark:text-zinc-300"}`}>
          {label}
        </div>
        {sub && <div className="text-[11px] text-[#A89B80]">{sub}</div>}
      </div>
      <div
        className={`text-[13.5px] ${bold ? "font-extrabold" : "font-semibold"} ${
          tone === "green"
            ? "text-[#3D6A2E] dark:text-emerald-300"
            : tone === "red"
            ? "text-red-600 dark:text-red-300"
            : "text-[#2A251D] dark:text-zinc-100"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
