"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/auth-provider";
import { formatWon } from "../_components/crm-labels";
import { DualLineChart } from "./_components/dual-line-chart";

interface Sess {
  reservationId: number;
  startsAt: string;
  endsAt: string | null;
  memberName: string;
  status: string;
}
interface TrainerData {
  month: {
    ym: string;
    confirmedRevenue: number;
    expectedRevenue: number;
    attendedCount: number;
    bookedCount: number;
    hasCommission: boolean;
    effectiveRate: number;
    confirmedPayout: number | null;
    expectedPayout: number | null;
  };
  metrics: {
    activeMembers: number;
    dormant2w: number;
    attendedThisMonth: number;
    bookedThisMonth: number;
    weekRemaining: number;
    avgPerWeek: number;
    avgPerDay: number;
    newThisMonth: number;
    renewalThisMonth: number;
    ratioNew: number;
    ratioRenewal: number;
  };
  today: { remaining: number; sessions: Sess[] };
  week: { days: { date: string; dow: number; count: number; sessions: Sess[] }[] };
  expiring: {
    memberId: number;
    memberName: string;
    lessonKind: string;
    expiresAt: string | null;
    remainingSessions: number;
    reason: "low_sessions" | "expiring";
  }[];
  outstanding: { memberName: string; product: string; outstandingWon: number; paymentStatus: string }[];
  memberProgress: {
    memberName: string;
    lessonKind: string;
    remaining: number;
    total: number;
    done: number;
    lastAttendedAt: string | null;
    nextReservationAt: string | null;
  }[];
  recentCompleted: {
    attendedAt: string;
    memberName: string;
    perSessionFee: number;
    paymentStatus: string | null;
  }[];
}

const DOW_LABEL = ["월", "화", "수", "목", "금", "토", "일"];

function kstTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("ko-KR", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "";
  }
}
function kstDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return "";
  }
}
const PAY_LABEL: Record<string, string> = { unpaid: "미납", partial: "부분납", paid: "완납" };

export function TrainerDashboard({
  centerName,
  displayName,
}: {
  centerName: string;
  displayName: string | null;
}) {
  const { getIdToken } = useAuth();
  const [data, setData] = useState<TrainerData | null>(null);
  const [trend, setTrend] = useState<{ ym: string; salary: number; salaryPrev: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [marking, setMarking] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const auth = { authorization: `Bearer ${token}` };
      const [res, tRes] = await Promise.all([
        fetch("/api/crm/dashboard/trainer", { headers: auth, cache: "no-store" }),
        fetch("/api/crm/dashboard/trainer/trend", { headers: auth, cache: "no-store" }),
      ]);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "조회 실패");
      setData(json);
      if (tRes.ok) setTrend(((await tRes.json()).months ?? []) as typeof trend);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    load();
  }, [load]);

  const markAttended = async (reservationId: number) => {
    if (marking) return;
    setMarking(reservationId);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/reservations/${reservationId}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ status: "attended" }),
      });
      if (res.ok) await load();
    } finally {
      setMarking(null);
    }
  };

  const m = data?.month;
  const nextToday = data?.today.sessions.find((s) => s.status === "booked");

  return (
    <div className="px-5 md:px-8 pt-2 pb-6 md:pt-3 md:pb-8 max-w-6xl mx-auto">
      {/* 헤더 */}
      <header className="mb-5 rounded-2xl border border-[#E4D9C6] dark:border-zinc-800 bg-white/80 dark:bg-zinc-900 px-4 py-4 md:px-5 md:py-5 shadow-sm">
        <p className="text-[12px] font-semibold text-[#7F6F55] dark:text-zinc-500">{centerName || "CRM"}</p>
        <h1 className="mt-1 text-[24px] md:text-[28px] leading-tight font-bold text-[#241F18] dark:text-zinc-100">
          개인 트레이너 대시보드
        </h1>
        <p className="mt-1.5 text-[13px] text-[#6B5D47] dark:text-zinc-400">
          {displayName ? <strong className="text-[#2A251D] dark:text-zinc-100">{displayName}</strong> : null}
          {displayName ? " · " : ""}내가 담당·등록한 회원과 내 수업료 중심
        </p>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</div>
      )}
      {loading || !data ? (
        <div className="py-16 text-center text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : (
        <>
          {/* 상단 핵심 카드 4 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <BigCard
              tone="gold"
              label="이번 달 확정 수업료"
              value={`${formatWon(m!.confirmedRevenue)}원`}
              hint={`출석완료 ${m!.attendedCount}건 · 부가세 제외`}
              sub={m!.confirmedPayout != null ? `내 정산 ${formatWon(m!.confirmedPayout)}원 (커미션 ${m!.effectiveRate}%)` : "실제 벌어들인 금액"}
            />
            <BigCard
              tone="green"
              emphasize
              label="이번 달 예상 수업료"
              value={`${formatWon(m!.expectedRevenue)}원`}
              hint={`출석 ${m!.attendedCount} + 예약 ${m!.bookedCount}건 기준`}
              sub={m!.expectedPayout != null ? `내 정산 ${formatWon(m!.expectedPayout)}원 (커미션 ${m!.effectiveRate}%)` : "예약이 모두 진행됐을 때"}
            />
            <BigCard
              tone="dark"
              label="오늘 남은 수업"
              value={`${data.today.remaining}건`}
              hint={
                nextToday
                  ? `다음 ${kstTime(nextToday.startsAt)} ${nextToday.memberName}`
                  : "오늘 남은 수업 없음"
              }
            />
            <BigCard
              tone="red"
              label="만료·재등록 필요"
              value={`${data.expiring.length}명`}
              hint="14일 내 만료 또는 잔여 2회 이하"
            />
          </div>

          {/* 운영 지표 — 회원 수(클릭 O) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-3">
            <StatCard href="/crm/members?status=valid" label="유효 회원" value={`${data.metrics.activeMembers}명`} tone="green" />
            <StatCard href="/crm/members?status=valid&absence=15d" label="2주+ 미진행 회원" value={`${data.metrics.dormant2w}명`} tone="red" hint="재방문 관리 대상" />
            <StatCard href="/crm/members?signup=this_month&registration_type=new" label="이번달 신규" value={`${data.metrics.newThisMonth}명`} />
            <StatCard href="/crm/members?signup=this_month&registration_type=renewal" label="이번달 재등록" value={`${data.metrics.renewalThisMonth}명`} />
          </div>

          {/* 운영 지표 — 세션 수(클릭 X) + 재등록/신규 비중 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-5">
            <StatCard label="이번달 진행 수업" value={`${data.metrics.attendedThisMonth}회`} />
            <StatCard label="이번달 미진행 수업" value={`${data.metrics.bookedThisMonth}회`} hint="예약됐지만 아직 진행 전" />
            <StatCard label="이번주 남은 수업" value={`${data.metrics.weekRemaining}회`} />
            <StatCard label="주당 / 일당 평균" value={`${data.metrics.avgPerWeek} / ${data.metrics.avgPerDay}회`} hint="최근 4주 기준" />
          </div>

          {/* 재등록 : 신규 비중 */}
          {data.metrics.newThisMonth + data.metrics.renewalThisMonth > 0 && (
            <section className="mb-5 rounded-2xl border border-[#E4D9C6] dark:border-zinc-800 bg-white/80 dark:bg-zinc-900 px-4 py-3.5 shadow-sm">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-[14px] font-bold text-[#241F18] dark:text-zinc-100">이번달 등록 비중</h2>
                <span className="text-[12px] text-[#8C8270]">
                  재등록 {data.metrics.ratioRenewal}% · 신규 {data.metrics.ratioNew}%
                </span>
              </div>
              <div className="flex h-3 rounded-full overflow-hidden bg-[#EFE7D5] dark:bg-zinc-800">
                <div className="h-full bg-[#B47B2A]" style={{ width: `${data.metrics.ratioRenewal}%` }} title={`재등록 ${data.metrics.renewalThisMonth}명`} />
                <div className="h-full bg-[#6B7B3A]" style={{ width: `${data.metrics.ratioNew}%` }} title={`신규 ${data.metrics.newThisMonth}명`} />
              </div>
              <div className="mt-1.5 flex gap-3 text-[11px]">
                <span className="text-[#B47B2A] font-semibold">■ 재등록 {data.metrics.renewalThisMonth}명</span>
                <span className="text-[#6B7B3A] font-semibold">■ 신규 {data.metrics.newThisMonth}명</span>
              </div>
            </section>
          )}

          {/* 월급(정산액) 12개월 추이 */}
          <Section title="월급 추이 (12개월)" subtitle="올해 vs 작년 동월">
            {trend.length === 0 ? (
              <Empty>표시할 데이터가 없어요.</Empty>
            ) : (
              <DualLineChart
                xLabels={trend.map((t) => t.ym.slice(2).replace("-", "/"))}
                primary={{ label: "올해", values: trend.map((t) => t.salary), dates: trend.map((t) => t.ym) }}
                secondary={{
                  label: "작년 동월",
                  values: trend.map((t) => t.salaryPrev),
                  dates: trend.map((t) => `${Number(t.ym.slice(0, 4)) - 1}${t.ym.slice(4)}`),
                }}
                unit="원"
              />
            )}
          </Section>

          {/* 오늘 일정 타임라인 */}
          <Section title="오늘 일정" subtitle={`${data.today.sessions.length}건`}>
            {data.today.sessions.length === 0 ? (
              <Empty>오늘 예약된 수업이 없어요.</Empty>
            ) : (
              <div className="divide-y divide-[#EFE7D5] dark:divide-zinc-800">
                {data.today.sessions.map((s) => (
                  <div key={s.reservationId} className="flex items-center gap-3 py-2.5">
                    <div className="w-14 shrink-0 text-[13px] font-bold text-[#2F3A2B] dark:text-[#A8B87A] tabular-nums">
                      {kstTime(s.startsAt)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-semibold text-[#2A251D] dark:text-zinc-100 truncate">
                        {s.memberName}
                      </div>
                    </div>
                    {s.status === "attended" ? (
                      <span className="shrink-0 px-2 py-1 rounded-md text-[11.5px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        출석완료
                      </span>
                    ) : s.status === "booked" ? (
                      <button
                        type="button"
                        onClick={() => markAttended(s.reservationId)}
                        disabled={marking === s.reservationId}
                        className="shrink-0 px-3 py-1.5 rounded-lg bg-[#2F3A2B] text-white text-[12px] font-semibold hover:bg-[#243020] disabled:opacity-60 dark:bg-[#A8B87A] dark:text-zinc-950"
                      >
                        {marking === s.reservationId ? "처리 중…" : "출석 확인"}
                      </button>
                    ) : (
                      <span className="shrink-0 px-2 py-1 rounded-md text-[11.5px] font-medium bg-[#F5F0E5] text-[#A89B80] dark:bg-zinc-800 dark:text-zinc-500">
                        {s.status === "noshow" ? "노쇼" : s.status}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* 이번 주 수업 캘린더 */}
          <Section title="이번 주 수업" subtitle={`${data.week.days.reduce((n, d) => n + d.count, 0)}건`}>
            <div className="grid grid-cols-7 gap-1.5">
              {data.week.days.map((d) => (
                <div
                  key={d.date}
                  className="rounded-lg border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-1.5 min-h-[72px]"
                >
                  <div className="flex items-baseline justify-between">
                    <span className={`text-[11px] font-bold ${d.dow >= 5 ? "text-[#B47B2A]" : "text-[#6B5D47] dark:text-zinc-400"}`}>
                      {DOW_LABEL[d.dow]}
                    </span>
                    <span className="text-[10px] text-[#A89B80]">{d.date.slice(8)}</span>
                  </div>
                  {d.count === 0 ? (
                    <div className="mt-1 text-[10.5px] text-[#C9BEA6]">-</div>
                  ) : (
                    <div className="mt-1 space-y-0.5">
                      {d.sessions.slice(0, 4).map((s) => (
                        <div
                          key={s.reservationId}
                          className={`truncate rounded px-1 py-0.5 text-[10px] ${
                            s.status === "attended"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                              : "bg-[#EFE7D5] text-[#6B5D47] dark:bg-zinc-800 dark:text-zinc-400"
                          }`}
                        >
                          {kstTime(s.startsAt)} {s.memberName}
                        </div>
                      ))}
                      {d.count > 4 && <div className="text-[10px] text-[#A89B80]">+{d.count - 4}</div>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Section>

          <div className="grid md:grid-cols-2 gap-4">
            {/* 만료 예정 / 잔여 2회 이하 */}
            <Section title="만료 예정 · 재등록 대상" subtitle={`${data.expiring.length}명`}>
              {data.expiring.length === 0 ? (
                <Empty>임박한 만료·저잔여 회원이 없어요.</Empty>
              ) : (
                <ul className="space-y-1.5">
                  {data.expiring.slice(0, 12).map((e, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <Link
                        href={`/crm/members/${e.memberId}`}
                        className="min-w-0 flex-1 text-[13px] font-semibold text-[#2A251D] dark:text-zinc-100 truncate hover:text-[#6B7B3A]"
                      >
                        {e.memberName} <span className="font-normal text-[#8C8270]">· {e.lessonKind}</span>
                      </Link>
                      <span
                        className={`shrink-0 px-1.5 py-0.5 rounded text-[10.5px] font-bold ${
                          e.reason === "low_sessions"
                            ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                            : "bg-[#F5E4C8] text-[#B47B2A] dark:bg-amber-950/40 dark:text-amber-300"
                        }`}
                      >
                        {e.reason === "low_sessions" ? `잔여 ${e.remainingSessions}회` : `~${e.expiresAt}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {/* 미수금 / 결제 대기 */}
            <Section title="미수금 · 결제 대기" subtitle={`${formatWon(data.outstanding.reduce((n, o) => n + o.outstandingWon, 0))}원`}>
              {data.outstanding.length === 0 ? (
                <Empty>미수금이 없어요.</Empty>
              ) : (
                <ul className="space-y-1.5">
                  {data.outstanding.slice(0, 12).map((o, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 text-[13px] text-[#2A251D] dark:text-zinc-100 truncate">
                        {o.memberName} <span className="text-[#8C8270]">· {o.product}</span>
                      </span>
                      <span className="shrink-0 px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-[#F5F0E5] text-[#A89B80] dark:bg-zinc-800">
                        {PAY_LABEL[o.paymentStatus] ?? o.paymentStatus}
                      </span>
                      <span className="shrink-0 text-[13px] font-bold text-[#B47B2A] dark:text-amber-300 tabular-nums">
                        {formatWon(o.outstandingWon)}원
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {/* 회원별 진행률 */}
            <Section title="회원별 수업 진행률" subtitle={`${data.memberProgress.length}명`}>
              {data.memberProgress.length === 0 ? (
                <Empty>진행 중인 수강권이 없어요.</Empty>
              ) : (
                <ul className="space-y-2">
                  {data.memberProgress.slice(0, 12).map((p, i) => {
                    const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
                    return (
                      <li key={i}>
                        <div className="flex items-center justify-between gap-2 text-[12.5px]">
                          <span className="min-w-0 truncate font-semibold text-[#2A251D] dark:text-zinc-100">
                            {p.memberName} <span className="font-normal text-[#8C8270]">· {p.lessonKind}</span>
                          </span>
                          <span className="shrink-0 tabular-nums text-[#6B5D47] dark:text-zinc-400">
                            {p.done}/{p.total}회
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-[#EFE7D5] dark:bg-zinc-800 overflow-hidden">
                          <div className="h-full rounded-full bg-[#6B7B3A]" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="mt-0.5 text-[10.5px] text-[#A89B80]">
                          {p.nextReservationAt ? `다음 ${kstDate(p.nextReservationAt)}` : "다음 예약 없음"}
                          {p.lastAttendedAt ? ` · 최근 ${kstDate(p.lastAttendedAt)}` : ""}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>

            {/* 최근 완료 수업 */}
            <Section title="최근 완료 수업" subtitle={`${data.recentCompleted.length}건`}>
              {data.recentCompleted.length === 0 ? (
                <Empty>완료된 수업 내역이 없어요.</Empty>
              ) : (
                <ul className="space-y-1.5">
                  {data.recentCompleted.slice(0, 12).map((r, i) => (
                    <li key={i} className="flex items-center gap-2 text-[12.5px]">
                      <span className="w-12 shrink-0 text-[#8C8270] tabular-nums">{kstDate(r.attendedAt)}</span>
                      <span className="min-w-0 flex-1 truncate font-semibold text-[#2A251D] dark:text-zinc-100">
                        {r.memberName}
                      </span>
                      {r.paymentStatus && r.paymentStatus !== "paid" && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300">
                          {PAY_LABEL[r.paymentStatus] ?? r.paymentStatus}
                        </span>
                      )}
                      <span className="shrink-0 tabular-nums font-semibold text-[#2F3A2B] dark:text-[#A8B87A]">
                        {formatWon(r.perSessionFee)}원
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        </>
      )}
    </div>
  );
}

function BigCard({
  label,
  value,
  hint,
  sub,
  tone,
  emphasize,
}: {
  label: string;
  value: string;
  hint?: string;
  sub?: string;
  tone: "gold" | "green" | "dark" | "red";
  emphasize?: boolean;
}) {
  const toneCls =
    tone === "green"
      ? "border-[#6B7B3A]/40 bg-[#EFF5E2]/70 dark:bg-[#6B7B3A]/15"
      : tone === "gold"
        ? "border-[#E8C088]/50 bg-[#F5E4C8]/50 dark:bg-amber-950/20"
        : tone === "red"
          ? "border-red-200 bg-red-50/70 dark:bg-red-950/20"
          : "border-[#E4D9C6] bg-white/80 dark:bg-zinc-900";
  return (
    <div
      className={`rounded-2xl border px-4 py-3.5 shadow-sm dark:border-zinc-800 ${toneCls} ${
        emphasize ? "ring-2 ring-[#6B7B3A]/30 lg:scale-[1.02]" : ""
      }`}
    >
      <div className="text-[12px] font-semibold text-[#7F6F55] dark:text-zinc-400">{label}</div>
      <div
        className={`mt-1 font-bold text-[#241F18] dark:text-zinc-100 ${
          emphasize ? "text-[24px] md:text-[27px]" : "text-[20px] md:text-[22px]"
        }`}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[11.5px] text-[#8C8270] dark:text-zinc-500">{hint}</div>}
      {sub && <div className="mt-1 text-[11.5px] font-medium text-[#6B7B3A] dark:text-[#A8B87A]">{sub}</div>}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  href,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
  tone?: "green" | "red";
}) {
  const valueCls =
    tone === "green"
      ? "text-[#2F3A2B] dark:text-[#A8B87A]"
      : tone === "red"
        ? "text-[#B4442A] dark:text-red-300"
        : "text-[#241F18] dark:text-zinc-100";
  const inner = (
    <>
      <div className="flex items-center gap-1">
        <span className="text-[11.5px] font-semibold text-[#7F6F55] dark:text-zinc-400 truncate">{label}</span>
        {href && (
          <svg className="ml-auto w-3.5 h-3.5 text-[#C9BEA6] group-hover:text-[#6B7B3A]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        )}
      </div>
      <div className={`mt-1 text-[19px] md:text-[21px] font-bold ${valueCls}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-[#8C8270] dark:text-zinc-500 truncate">{hint}</div>}
    </>
  );
  const base = "rounded-xl border border-[#E4D9C6] dark:border-zinc-800 bg-white/80 dark:bg-zinc-900 px-3.5 py-3 shadow-sm";
  return href ? (
    <Link href={href} className={`group block ${base} hover:border-[#6B7B3A]/50 hover:bg-[#F5F0E5]/40 dark:hover:bg-zinc-800/60 transition-colors`}>
      {inner}
    </Link>
  ) : (
    <div className={base}>{inner}</div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4 rounded-2xl border border-[#E4D9C6] dark:border-zinc-800 bg-white/80 dark:bg-zinc-900 px-4 py-3.5 shadow-sm">
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <h2 className="text-[14.5px] font-bold text-[#241F18] dark:text-zinc-100">{title}</h2>
        {subtitle && <span className="text-[12px] font-semibold text-[#8C8270] dark:text-zinc-500">{subtitle}</span>}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-6 text-center text-[12.5px] text-[#A89B80]">{children}</div>;
}
