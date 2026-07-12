"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { CrmLineChart } from "../_components/crm-line-chart";
import { CrmDonutChart } from "../_components/crm-donut-chart";
import { PAYMENT_METHOD_LABEL, formatWon } from "../_components/crm-labels";

interface TrendPoint {
  ym: string;
  revenue: number;
}

interface MonthlyResp {
  ym: string;
  summary: {
    newMembers: number;
    memberCount: number;
    totalRevenue: number;
    totalPassCount: number;
  };
  paymentBreakdown: Record<string, number>;
  trainers: {
    trainerMemberId: number;
    name: string;
    role: string;
    passes: { new: number; renewal: number; trial: number; service: number; total: number; revenue: number };
    reservations: { attended: number; cancelled: number; noshow: number; booked: number };
  }[];
}

interface GenderCount {
  count: number;
  male: number;
  female: number;
}

interface SummaryResp {
  period: "day" | "week" | "month";
  range: { from: string; to: string };
  members: {
    total: GenderCount;
    active: GenderCount;
    expired: GenderCount;
    newly: GenderCount;
    reregistered: GenderCount;
  };
  attendance: { attended: GenderCount; working: GenderCount };
  revenue: {
    membership: number;
    personal: number;
    group: number;
    locker: number;
    goods: number;
    total: number;
  };
  classes: {
    group: { count: number; applicants: number };
    personal: { count: number; applicants: number };
    ot: { count: number; applicants: number };
  };
}

interface BootstrapResp {
  role: "owner" | "admin" | "manager" | "trainer";
  displayName: string | null;
  centerName: string;
}

const DONUT_COLORS = ["#6B7B3A", "#B47B2A", "#A8B87A", "#E8C088", "#8C8270"];

const ROLE_LABEL: Record<string, string> = {
  owner: "대표자",
  admin: "관리자",
  manager: "팀장",
  trainer: "강사",
};

type Period = "day" | "week" | "month";

export default function CrmDashboardPage() {
  const { getIdToken } = useAuth();
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [monthly, setMonthly] = useState<MonthlyResp | null>(null);
  const [summary, setSummary] = useState<SummaryResp | null>(null);
  const [me, setMe] = useState<BootstrapResp | null>(null);
  const [period, setPeriod] = useState<Period>("month");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const auth = { authorization: `Bearer ${token}` };
      const [a, b, c, d] = await Promise.all([
        fetch("/api/crm/stats/trend", { headers: auth }),
        fetch("/api/crm/stats/monthly", { headers: auth }),
        fetch(`/api/crm/dashboard/summary?period=${period}`, { headers: auth, cache: "no-store" }),
        fetch("/api/crm/bootstrap", { headers: auth, cache: "no-store" }),
      ]);
      if (!a.ok || !b.ok || !c.ok) {
        const err = !a.ok ? await a.json() : !b.ok ? await b.json() : await c.json();
        throw new Error(err?.error || "조회 실패");
      }
      setTrend(((await a.json()).months ?? []) as TrendPoint[]);
      setMonthly(await b.json());
      setSummary(await c.json());
      if (d.ok) setMe(await d.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken, period]);

  useEffect(() => {
    load();
  }, [load]);

  const todayLabel = (() => {
    const d = new Date();
    const k = new Date(d.getTime() + 9 * 3600 * 1000);
    return `${k.getUTCFullYear()}년 ${String(k.getUTCMonth() + 1).padStart(2, "0")}월 ${String(k.getUTCDate()).padStart(2, "0")}일`;
  })();

  return (
    <div className="px-5 md:px-8 pt-2 pb-6 md:pt-3 md:pb-8 max-w-6xl mx-auto">
      {/* 헤더 */}
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[18px] md:text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
            대시보드
          </h1>
          <p className="mt-1 text-[13px] text-[#6B5D47] dark:text-zinc-400">
            {me?.displayName ? (
              <>
                <strong className="text-[#2A251D] dark:text-zinc-100">{me.displayName}</strong>{" "}
                <span className="text-[#8C8270]">· {ROLE_LABEL[me.role] ?? me.role}</span>
              </>
            ) : (
              "센터 운영 현황을 한눈에 확인해요."
            )}
            <span className="ml-2 text-[#A89B80]">· {todayLabel}</span>
          </p>
        </div>

        {/* 기간 탭 */}
        <div className="inline-flex border border-[#E8E0D0] dark:border-zinc-700 rounded-lg overflow-hidden">
          {(["day", "week", "month"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 text-[12.5px] font-medium transition-colors
                ${period === p
                  ? "bg-[#6B7B3A] text-white"
                  : "bg-[#FEFCF7] dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5]"
                }`}
            >
              {p === "day" ? "일간" : p === "week" ? "주간" : "월간"}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-[13px] text-[#8C8270] py-8 text-center">불러오는 중…</div>
      ) : (
        <div className="space-y-5">
          {/* 회원 통계 */}
          {summary && (
            <SectionHeader
              title="회원 통계"
              subtitle={`${summary.range.from === summary.range.to ? summary.range.to : `${summary.range.from} ~ ${summary.range.to}`} · 총 ${summary.members.total.count.toLocaleString()}명`}
            />
          )}
          {summary && (
            <>
              <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <GenderStatCard label="유효 회원" data={summary.members.active} accent />
                <GenderStatCard label="만기 회원" data={summary.members.expired} tone="warn" />
                <GenderStatCard
                  label="신규 가입"
                  data={summary.members.newly}
                  ratioNote={(() => {
                    const t = summary.members.newly.count + summary.members.reregistered.count;
                    if (!t) return "이번달 등록 없음";
                    return `등록 중 ${Math.round((summary.members.newly.count / t) * 100)}%`;
                  })()}
                />
                <GenderStatCard
                  label="재등록"
                  data={summary.members.reregistered}
                  ratioNote={(() => {
                    const t = summary.members.newly.count + summary.members.reregistered.count;
                    if (!t) return "이번달 등록 없음";
                    return `등록 중 ${Math.round((summary.members.reregistered.count / t) * 100)}%`;
                  })()}
                />
              </section>

              {/* 신규 vs 재등록 비율 스택바 */}
              {(summary.members.newly.count + summary.members.reregistered.count) > 0 && (
                <RegistrationMixBar
                  newly={summary.members.newly.count}
                  reregistered={summary.members.reregistered.count}
                />
              )}
            </>
          )}

          {/* 출석 통계 */}
          {summary && (
            <>
              <SectionHeader
                title="출석 통계"
                subtitle="이용한 회원(기간 내 출석) · 운동 중인 회원(오늘 활성 상품 보유)"
              />
              <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <GenderStatCard label="이용한 회원" data={summary.attendance.attended} accent />
                <GenderStatCard label="운동 중인 회원" data={summary.attendance.working} />
              </section>
            </>
          )}

          {/* 매출 통계 */}
          {summary && (
            <>
              <SectionHeader
                title="매출 통계"
                subtitle={
                  <>
                    총 매출{" "}
                    <strong className="text-[#6B7B3A] dark:text-[#A8B87A]">
                      {formatWon(summary.revenue.total)}원
                    </strong>
                  </>
                }
              />
              <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <RevenueCard label="회원권" value={summary.revenue.membership} />
                <RevenueCard label="개인 레슨" value={summary.revenue.personal} />
                <RevenueCard label="그룹 수업" value={summary.revenue.group} note={summary.revenue.group === 0 ? "추적 예정" : undefined} />
                <RevenueCard label="락커" value={summary.revenue.locker} note={summary.revenue.locker === 0 ? "추적 예정" : undefined} />
                <RevenueCard label="운동 용품" value={summary.revenue.goods} note={summary.revenue.goods === 0 ? "추적 예정" : undefined} />
              </section>
            </>
          )}

          {/* 수업 통계 */}
          {summary && (
            <>
              <SectionHeader title="수업 통계" subtitle="예약 건수 / 신청자 (unique 회원)" />
              <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <ClassCard label="개인 레슨" data={summary.classes.personal} />
                <ClassCard
                  label="그룹 수업"
                  data={summary.classes.group}
                  note="그룹 수업 추적은 추후 지원"
                />
                <ClassCard
                  label="OT (오리엔테이션)"
                  data={summary.classes.ot}
                  note="OT 추적은 추후 지원"
                />
              </section>
            </>
          )}

          {/* PT 매출 추이 + 결제 방법 */}
          <SectionHeader title="이번달 상세" subtitle="12개월 매출 추이 + 결제 방법 분포" />
          <section className="grid md:grid-cols-3 gap-3">
            <div className="md:col-span-2 px-5 py-4 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
              <h3 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-2">
                월별 PT매출 추이 (12개월)
              </h3>
              <CrmLineChart
                points={trend.map((m) => ({ label: m.ym.slice(2).replace("-", "/"), value: m.revenue }))}
                unit="원"
              />
            </div>
            <div className="px-5 py-4 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
              <h3 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-2">
                이번달 결제 방법
              </h3>
              {monthly && (
                <CrmDonutChart
                  slices={Object.entries(monthly.paymentBreakdown).map(([k, v], i) => ({
                    label: PAYMENT_METHOD_LABEL[k] ?? k,
                    value: v,
                    color: DONUT_COLORS[i % DONUT_COLORS.length],
                  }))}
                />
              )}
            </div>
          </section>

          {/* 강사 랭킹 */}
          {monthly && monthly.trainers.length > 0 && (
            <>
              <SectionHeader title="강사 랭킹" subtitle="이번달 실적" />
              <section className="grid md:grid-cols-2 gap-3">
                <RankBox
                  title="PT매출 TOP 5"
                  rows={[...monthly.trainers]
                    .sort((a, b) => b.passes.revenue - a.passes.revenue)
                    .slice(0, 5)
                    .map((t) => ({ label: t.name, value: `${formatWon(t.passes.revenue)}원` }))}
                />
                <RankBox
                  title="수업완료 TOP 5"
                  rows={[...monthly.trainers]
                    .sort((a, b) => b.reservations.attended - a.reservations.attended)
                    .slice(0, 5)
                    .map((t) => ({ label: t.name, value: `${t.reservations.attended}회` }))}
                />
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: React.ReactNode }) {
  return (
    <div className="pt-2 pb-1 border-b border-[#E8E0D0]/60 dark:border-zinc-800 flex items-baseline justify-between gap-2 flex-wrap">
      <h2 className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100">{title}</h2>
      {subtitle && (
        <span className="text-[11.5px] text-[#8C8270] dark:text-zinc-500">{subtitle}</span>
      )}
    </div>
  );
}

function RegistrationMixBar({
  newly,
  reregistered,
}: {
  newly: number;
  reregistered: number;
}) {
  const total = newly + reregistered;
  const newPct = total > 0 ? (newly / total) * 100 : 0;
  const rePct = total > 0 ? (reregistered / total) * 100 : 0;
  return (
    <div className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 px-4 py-3">
      <div className="flex items-center justify-between mb-2 text-[12.5px] text-[#3A342A] dark:text-zinc-200">
        <span className="font-semibold">이번달 등록 구성</span>
        <span className="text-[#8C8270]">총 {total.toLocaleString()}건</span>
      </div>
      <div className="relative h-3 rounded-full overflow-hidden bg-[#F5F0E5] dark:bg-zinc-800 flex">
        <div
          className="h-full bg-[#6B7B3A] transition-all"
          style={{ width: `${newPct}%` }}
          title={`신규 ${newly}명 (${newPct.toFixed(1)}%)`}
        />
        <div
          className="h-full bg-[#B47B2A] transition-all"
          style={{ width: `${rePct}%` }}
          title={`재등록 ${reregistered}명 (${rePct.toFixed(1)}%)`}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11.5px]">
        <span className="flex items-center gap-1.5 text-[#6B7B3A] dark:text-[#A8B87A]">
          <span className="w-2 h-2 rounded-full bg-[#6B7B3A]" />
          신규 <strong className="font-bold">{newly.toLocaleString()}</strong>명
          <span className="text-[#8C8270]">({newPct.toFixed(1)}%)</span>
        </span>
        <span className="flex items-center gap-1.5 text-[#B47B2A] dark:text-amber-300">
          <span className="w-2 h-2 rounded-full bg-[#B47B2A]" />
          재등록 <strong className="font-bold">{reregistered.toLocaleString()}</strong>명
          <span className="text-[#8C8270]">({rePct.toFixed(1)}%)</span>
        </span>
      </div>
    </div>
  );
}

function GenderStatCard({
  label,
  data,
  accent,
  tone,
  ratioNote,
}: {
  label: string;
  data: GenderCount;
  accent?: boolean;
  tone?: "warn";
  ratioNote?: string;
}) {
  const mainCls =
    tone === "warn"
      ? "text-[#B47B2A] dark:text-amber-300"
      : accent
      ? "text-[#6B7B3A] dark:text-[#A8B87A]"
      : "text-[#2A251D] dark:text-zinc-100";
  return (
    <div className="px-4 py-3.5 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
      <div className="text-[12px] text-[#8C8270] dark:text-zinc-500">{label}</div>
      <div className={`mt-1 text-[22px] font-bold ${mainCls}`}>
        {data.count.toLocaleString()}
        <span className="text-[12px] font-medium ml-1 text-[#8C8270]">명</span>
      </div>
      {ratioNote && (
        <div className="mt-0.5 text-[11px] font-medium text-[#B47B2A] dark:text-amber-300">
          {ratioNote}
        </div>
      )}
      <div className="mt-1.5 flex items-center gap-3 text-[11.5px] text-[#6B5D47] dark:text-zinc-400">
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#5A8BB0]" />
          남성 {data.male.toLocaleString()}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#C76C8E]" />
          여성 {data.female.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

function RevenueCard({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="px-4 py-3.5 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
      <div className="text-[12px] text-[#8C8270] dark:text-zinc-500">{label}</div>
      <div className={`mt-1 text-[18px] font-bold ${value > 0 ? "text-[#6B7B3A] dark:text-[#A8B87A]" : "text-[#3A342A] dark:text-zinc-300"}`}>
        {formatWon(value)}
        <span className="text-[12px] font-medium ml-0.5 text-[#8C8270]">원</span>
      </div>
      {note && <div className="mt-0.5 text-[10.5px] text-[#A89B80]">{note}</div>}
    </div>
  );
}

function ClassCard({
  label,
  data,
  note,
}: {
  label: string;
  data: { count: number; applicants: number };
  note?: string;
}) {
  return (
    <div className="px-4 py-3.5 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
      <div className="text-[12px] text-[#8C8270] dark:text-zinc-500">{label}</div>
      <div className="mt-1.5 flex items-center gap-4">
        <div>
          <div className="text-[10.5px] text-[#A89B80]">수업</div>
          <div className="text-[18px] font-bold text-[#2A251D] dark:text-zinc-100">
            {data.count.toLocaleString()}
            <span className="text-[11px] ml-0.5 font-medium text-[#8C8270]">건</span>
          </div>
        </div>
        <div>
          <div className="text-[10.5px] text-[#A89B80]">신청자</div>
          <div className="text-[18px] font-bold text-[#6B7B3A] dark:text-[#A8B87A]">
            {data.applicants.toLocaleString()}
            <span className="text-[11px] ml-0.5 font-medium text-[#8C8270]">명</span>
          </div>
        </div>
      </div>
      {note && <div className="mt-1.5 text-[10.5px] text-[#A89B80]">{note}</div>}
    </div>
  );
}

function RankBox({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string }[];
}) {
  return (
    <div className="px-5 py-4 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
      <h3 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-2">{title}</h3>
      {rows.length === 0 ? (
        <div className="text-[12.5px] text-[#8C8270] py-3">데이터 없음</div>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((r, i) => (
            <li key={i} className="flex items-center justify-between gap-2 text-[13px]">
              <span className="flex items-center gap-2 truncate">
                <Medal place={i + 1} />
                <span className="truncate text-[#3A342A] dark:text-zinc-300">{r.label}</span>
              </span>
              <span className="font-semibold text-[#6B7B3A] dark:text-[#A8B87A] shrink-0">{r.value}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Medal({ place }: { place: number }) {
  const color =
    place === 1 ? "bg-[#E8C088]" : place === 2 ? "bg-[#C5C5C5]" : place === 3 ? "bg-[#D4A37C]" : "bg-[#F5F0E5]";
  const text = place <= 3 ? "text-[#2A251D]" : "text-[#A89B80]";
  return (
    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${color} ${text}`}>
      {place}
    </span>
  );
}
