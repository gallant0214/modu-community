"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/auth-provider";
import { CrmLineChart } from "../_components/crm-line-chart";
import { CrmDonutChart } from "../_components/crm-donut-chart";
import { PAYMENT_METHOD_LABEL, formatWon } from "../_components/crm-labels";

interface TrendPoint {
  ym: string;
  revenue: number;
  membershipRevenue: number;
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
  attendance: {
    attended: GenderCount;
    working: GenderCount;
    inactive15d?: GenderCount;
    weekly?: { label: string; count: number }[];
    weeklyAvg?: { label: string; count: number }[];
    weekStart?: string;
  };
  revenue: {
    membership: number;
    lesson: number;
    lessonByGender?: {
      male: number;
      female: number;
    };
    locker: number;
    goods: number;
    rental: number;
    total: number;
  };
  active_by_type: {
    new: number;
    renewal: number;
    unknown: number;
  };
  active_by_product?: {
    lesson: number;
    membership: number;
  };
  classes: {
    group: { count: number; applicants: number; pending?: number };
    personal: { count: number; applicants: number; pending?: number };
    ot: { count: number; applicants: number; pending?: number };
  };
}

interface BootstrapResp {
  role: "owner" | "admin" | "manager" | "trainer";
  displayName: string | null;
  centerName: string;
  permissions: Record<string, boolean>;
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

  // 재무 지표(매출/결제/랭킹) 가시성 — dashboard.finance 권한 기반 (owner 는 서버측에서 항상 true)
  const canFinance = me?.permissions?.["dashboard.finance"] ?? false;

  const todayLabel = (() => {
    const d = new Date();
    const k = new Date(d.getTime() + 9 * 3600 * 1000);
    return `${k.getUTCFullYear()}년 ${String(k.getUTCMonth() + 1).padStart(2, "0")}월 ${String(k.getUTCDate()).padStart(2, "0")}일`;
  })();
  const rangeLabel = summary
    ? summary.range.from === summary.range.to
      ? summary.range.to
      : `${summary.range.from} ~ ${summary.range.to}`
    : "";
  const registrationTotal = summary
    ? summary.members.newly.count + summary.members.reregistered.count
    : 0;
  const periodLabel = period === "day" ? "일간" : period === "week" ? "주간" : "월간";

  return (
    <div className="px-5 md:px-8 pt-2 pb-6 md:pt-3 md:pb-8 max-w-6xl mx-auto">
      <header className="mb-5 rounded-2xl border border-[#E4D9C6] dark:border-zinc-800 bg-white/80 dark:bg-zinc-900 px-4 py-4 md:px-5 md:py-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <p className="text-[12px] font-semibold text-[#7F6F55] dark:text-zinc-500">
              {me?.centerName ?? "CRM"}
            </p>
            <h1 className="mt-1 text-[24px] md:text-[28px] leading-tight font-bold text-[#241F18] dark:text-zinc-100">
              운영 대시보드
            </h1>
            <p className="mt-1.5 text-[13px] text-[#6B5D47] dark:text-zinc-400">
              {me?.displayName ? (
                <>
                  <strong className="text-[#2A251D] dark:text-zinc-100">{me.displayName}</strong>{" "}
                  <span className="text-[#8C8270]">· {ROLE_LABEL[me.role] ?? me.role}</span>
                </>
              ) : (
                "센터 운영 현황"
              )}
              <span className="ml-2 text-[#A89B80]">· {todayLabel}</span>
            </p>
          </div>

          <div className="inline-flex self-start rounded-lg border border-[#D9CDB8] dark:border-zinc-700 bg-[#F8F4EC] dark:bg-zinc-950 p-1">
            {(["day", "week", "month"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3.5 py-1.5 rounded-md text-[12.5px] font-semibold transition-colors
                  ${period === p
                    ? "bg-[#2F3A2B] text-white dark:bg-[#A8B87A] dark:text-zinc-950"
                    : "text-[#6B5D47] dark:text-zinc-400 hover:bg-white/80 dark:hover:bg-zinc-800"
                  }`}
              >
                {p === "day" ? "일간" : p === "week" ? "주간" : "월간"}
              </button>
            ))}
          </div>
        </div>

        {summary && (
          <section className="mt-5 grid grid-cols-2 lg:grid-cols-3 gap-2">
            <DashboardHeroMetric
              label="유효 회원"
              value={`${summary.members.active.count.toLocaleString()}명`}
              hint={`전체 ${summary.members.total.count.toLocaleString()}명`}
              tone="green"
            />
            <DashboardHeroMetric
              label={canFinance ? `${periodLabel} 매출` : `${periodLabel} 수업`}
              value={
                canFinance
                  ? `${formatWon(summary.revenue.total)}원`
                  : `${summary.classes.personal.count + summary.classes.group.count + summary.classes.ot.count}건`
              }
              hint={canFinance ? rangeLabel : `신청자 ${summary.classes.personal.applicants + summary.classes.group.applicants + summary.classes.ot.applicants}명`}
              tone="gold"
            />
            <DashboardHeroMetric
              label="신규/재등록"
              value={`${registrationTotal.toLocaleString()}건`}
              hint={`신규 ${summary.members.newly.count.toLocaleString()} · 재등록 ${summary.members.reregistered.count.toLocaleString()}`}
              tone="default"
            />
          </section>
        )}
      </header>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-[13px] text-[#8C8270] py-8 text-center">불러오는 중…</div>
      ) : (
        <div className="space-y-4">
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

              {/* 신규 vs 재등록 비율 스택바 (이번 기간 등록) */}
              {(summary.members.newly.count + summary.members.reregistered.count) > 0 && (
                <RegistrationMixBar
                  newly={summary.members.newly.count}
                  reregistered={summary.members.reregistered.count}
                />
              )}

              {/* 유효 회원 신규/재등록 구성 도넛 (전체 스냅샷) */}
              {(summary.active_by_type.new + summary.active_by_type.renewal + summary.active_by_type.unknown) > 0 && (
                <div className="rounded-xl border border-[#E4D9C6] dark:border-zinc-800 bg-white/80 dark:bg-zinc-900 px-5 py-4 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">
                      유효 회원 구성 (신규 vs 재등록)
                    </h3>
                    <span className="text-[11.5px] text-[#8C8270]">
                      총 {summary.members.active.count.toLocaleString()}명
                    </span>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div>
                      <div className="mb-2 text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-400">
                        신규/재등록
                      </div>
                      <CrmDonutChart
                        valueKind="count"
                        showLegendValue
                        slices={[
                          {
                            label: "신규",
                            value: summary.active_by_type.new,
                            color: "#6B7B3A",
                          },
                          {
                            label: "재등록",
                            value: summary.active_by_type.renewal,
                            color: "#B47B2A",
                          },
                          ...(summary.active_by_type.unknown > 0
                            ? [{ label: "구분 없음", value: summary.active_by_type.unknown, color: "#A89B80" }]
                            : []),
                        ]}
                      />
                    </div>
                    <div className="lg:border-l lg:border-[#E8E0D0] lg:pl-4 dark:lg:border-zinc-800">
                      <div className="mb-2 text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-400">
                        남/여 성비
                      </div>
                      <CrmDonutChart
                        valueKind="count"
                        showLegendValue
                        slices={[
                          { label: "남성", value: summary.members.active.male, color: "#5A8BB0" },
                          { label: "여성", value: summary.members.active.female, color: "#C76C8E" },
                          ...(
                            summary.members.active.count -
                              summary.members.active.male -
                              summary.members.active.female >
                            0
                              ? [
                                  {
                                    label: "기타",
                                    value:
                                      summary.members.active.count -
                                      summary.members.active.male -
                                      summary.members.active.female,
                                    color: "#A89B80",
                                  },
                                ]
                              : []
                          ),
                        ]}
                      />
                    </div>
                    <div className="lg:border-l lg:border-[#E8E0D0] lg:pl-4 dark:lg:border-zinc-800">
                      <div className="mb-2 text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-400">
                        레슨/일반 이용권
                      </div>
                      <CrmDonutChart
                        valueKind="count"
                        showLegendValue
                        slices={[
                          {
                            label: "레슨권",
                            value: summary.active_by_product?.lesson ?? 0,
                            color: "#8B6BAA",
                          },
                          {
                            label: "이용권",
                            value: summary.active_by_product?.membership ?? 0,
                            color: "#6B7B3A",
                          },
                        ]}
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* 출석 통계 */}
          {summary && (
            <>
              <SectionHeader
                title="출석 통계"
                subtitle="출석 흐름과 장기 미출석 유효회원"
              />
              <section className="grid gap-3">
                {/* 주간(월~일) 출석 그래프 — 매출 그래프와 동일 스타일 */}
                <div className="px-5 py-4 rounded-xl border border-[#E4D9C6] dark:border-zinc-800 bg-white/80 dark:bg-zinc-900 shadow-sm">
                  <h3 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-2">
                    주간 출석 (월~일)
                  </h3>
                  <CrmLineChart
                    points={(summary.attendance.weekly ?? []).map((w) => ({
                      label: w.label,
                      value: w.count,
                    }))}
                    unit="명"
                    color="#5A8BB0"
                    overlay={(summary.attendance.weeklyAvg ?? []).map((w) => ({
                      label: w.label,
                      value: w.count,
                    }))}
                    overlayLabel="평균(최근 12주)"
                  />
                </div>
                <Link href="/crm/members?status=valid&absence=15d" className="block md:max-w-xs">
                  <GenderStatCard
                    label="15일 이상 미출석"
                    data={summary.attendance.inactive15d ?? { count: 0, male: 0, female: 0 }}
                    tone="warn"
                    ratioNote="목록 보기"
                  />
                </Link>
              </section>
            </>
          )}

          {/* 매출 통계 — 재무 권한(dashboard.finance) 필요 */}
          {summary && canFinance && (
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
              <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <RevenueCard label="이용권" value={summary.revenue.membership} />
                <RevenueCard label="레슨권" value={summary.revenue.lesson} note="개인 레슨 + 그룹 수업" />
                <RevenueCard label="락커" value={summary.revenue.locker} />
                <RevenueCard label="운동 용품" value={summary.revenue.goods} />
              </section>

              {/* 전체 매출 카테고리 도넛 (이용권/레슨권/대여권) */}
              {summary.revenue.total > 0 && (
                <div className="rounded-xl border border-[#E4D9C6] dark:border-zinc-800 bg-white/80 dark:bg-zinc-900 px-5 py-4 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">
                      매출 카테고리 구성
                    </h3>
                    <span className="text-[11.5px] text-[#8C8270]">
                      총 {formatWon(summary.revenue.total)}원
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    <div>
                      <div className="mb-2 text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-400">
                        전체 매출
                      </div>
                      <CrmDonutChart
                        valueKind="money"
                        showLegendValue
                        legendPosition="bottom"
                        slices={[
                          { label: "이용권", value: summary.revenue.membership, color: "#6B7B3A" },
                          { label: "레슨권", value: summary.revenue.lesson, color: "#8B6BAA" },
                          { label: "대여권", value: summary.revenue.rental, color: "#5A8BB0" },
                        ]}
                      />
                    </div>
                    <div className="md:border-l md:border-[#E8E0D0] md:pl-4 dark:md:border-zinc-800">
                      <div className="mb-2 text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-400">
                        이용권 세부 구성
                      </div>
                      <CrmDonutChart
                        valueKind="money"
                        showLegendValue
                        legendPosition="bottom"
                        slices={[
                          { label: "이용권", value: summary.revenue.membership, color: "#6B7B3A" },
                          { label: "운동복", value: summary.revenue.rental, color: "#5A8BB0" },
                          { label: "라커", value: summary.revenue.locker, color: "#B47B2A" },
                        ]}
                      />
                    </div>
                    <div className="xl:border-l xl:border-[#E8E0D0] xl:pl-4 dark:xl:border-zinc-800">
                      <div className="mb-2 text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-400">
                        레슨권 세부 구성
                      </div>
                      <CrmDonutChart
                        valueKind="money"
                        showLegendValue
                        legendPosition="bottom"
                        slices={[
                          { label: "남", value: summary.revenue.lessonByGender?.male ?? 0, color: "#5A8BB0" },
                          { label: "여", value: summary.revenue.lessonByGender?.female ?? 0, color: "#C77D7D" },
                        ]}
                      />
                    </div>
                    {monthly && (
                      <div className="md:border-l md:border-[#E8E0D0] md:pl-4 dark:md:border-zinc-800">
                        <div className="mb-2 text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-400">
                          이번달 결제 방법
                        </div>
                        <CrmDonutChart
                          valueKind="money"
                          showLegendValue
                          legendPosition="bottom"
                          slices={Object.entries(monthly.paymentBreakdown).map(([k, v], i) => ({
                            label: PAYMENT_METHOD_LABEL[k] ?? k,
                            value: v,
                            color: DONUT_COLORS[i % DONUT_COLORS.length],
                          }))}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* 수업 통계 */}
          {summary && (
            <>
              <SectionHeader title="수업 통계" subtitle="예약 건수 / 신청자 / 미진행(결제했으나 미예약 잔여 세션)" />
              <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <ClassCard label="개인 레슨" data={summary.classes.personal} />
                <ClassCard
                  label="그룹 수업"
                  data={summary.classes.group}
                />
                <ClassCard
                  label="OT (오리엔테이션)"
                  data={summary.classes.ot}
                />
              </section>
            </>
          )}

          {/* PT/이용권 매출 추이 — 재무 권한 필요 */}
          {canFinance && (
          <>
          <SectionHeader title="이번달 상세" subtitle="12개월 매출 추이" />
          <section className="grid gap-3">
            <div className="px-5 py-4 rounded-xl border border-[#E4D9C6] dark:border-zinc-800 bg-white/80 dark:bg-zinc-900 shadow-sm">
              <h3 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-2">
                월별 PT매출 추이 (12개월)
              </h3>
              <CrmLineChart
                points={trend.map((m) => ({ label: m.ym.slice(2).replace("-", "/"), value: m.revenue }))}
                unit="원"
              />
            </div>
            <div className="px-5 py-4 rounded-xl border border-[#E4D9C6] dark:border-zinc-800 bg-white/80 dark:bg-zinc-900 shadow-sm">
              <h3 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-2">
                월별 이용권 매출 추이 (12개월)
              </h3>
              <CrmLineChart
                points={trend.map((m) => ({
                  label: m.ym.slice(2).replace("-", "/"),
                  value: m.membershipRevenue ?? 0,
                }))}
                unit="원"
              />
            </div>
          </section>
          </>
          )}

          {/* 강사 랭킹 — PT매출은 재무 권한 필요, 수업완료는 항상 표시 */}
          {monthly && monthly.trainers.length > 0 && (
            <>
              <SectionHeader title="강사 랭킹" subtitle="이번달 실적" />
              <section className={`grid gap-3 ${canFinance ? "md:grid-cols-2" : "md:grid-cols-1"}`}>
                {canFinance && (
                  <RankBox
                    title="PT매출 TOP 5"
                    rows={[...monthly.trainers]
                      .sort((a, b) => b.passes.revenue - a.passes.revenue)
                      .slice(0, 5)
                      .map((t) => ({ label: t.name, value: `${formatWon(t.passes.revenue)}원` }))}
                  />
                )}
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
    <div className="pt-2 pb-1.5 flex items-end justify-between gap-2 flex-wrap">
      <h2 className="text-[15px] font-bold text-[#241F18] dark:text-zinc-100">{title}</h2>
      {subtitle && (
        <span className="text-[11.5px] text-[#8C8270] dark:text-zinc-500">{subtitle}</span>
      )}
    </div>
  );
}

function DashboardHeroMetric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "default" | "green" | "blue" | "gold";
}) {
  const toneCls =
    tone === "green"
      ? "text-[#2F6F54] dark:text-emerald-300"
      : tone === "blue"
      ? "text-[#315F7D] dark:text-sky-300"
      : tone === "gold"
      ? "text-[#8A641D] dark:text-amber-300"
      : "text-[#241F18] dark:text-zinc-100";

  return (
    <div className="rounded-xl border border-[#E8E0D0]/80 dark:border-zinc-800 bg-[#FFFEFB] dark:bg-zinc-950/40 px-3 py-2.5 min-w-0">
      <div className="text-[11px] font-semibold text-[#8C8270] dark:text-zinc-500">{label}</div>
      <div className={`mt-1 text-[17px] md:text-[18px] font-bold truncate ${toneCls}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-[#A89B80] dark:text-zinc-500 truncate">{hint}</div>
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
    <div className="rounded-xl border border-[#E4D9C6] dark:border-zinc-800 bg-white/80 dark:bg-zinc-900 px-4 py-3 shadow-sm">
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
    <div className="px-4 py-3.5 rounded-xl border border-[#E4D9C6] dark:border-zinc-800 bg-white/80 dark:bg-zinc-900 shadow-sm">
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
    <div className="px-4 py-3.5 rounded-xl border border-[#E4D9C6] dark:border-zinc-800 bg-white/80 dark:bg-zinc-900 shadow-sm">
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
  data: { count: number; applicants: number; pending?: number };
  note?: string;
}) {
  return (
    <div className="px-4 py-3.5 rounded-xl border border-[#E4D9C6] dark:border-zinc-800 bg-white/80 dark:bg-zinc-900 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-bold text-[#241F18] dark:text-zinc-100">{label}</h3>
        {note && <span className="text-[10.5px] text-[#A89B80]">{note}</span>}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-[#F8F4EC] dark:bg-zinc-950/50 px-3 py-2">
          <div className="text-[10.5px] font-semibold text-[#8C8270] dark:text-zinc-500">수업</div>
          <div className="mt-0.5 text-[20px] leading-none font-bold text-[#241F18] dark:text-zinc-100">
            {data.count.toLocaleString()}
            <span className="text-[11px] ml-0.5 font-medium text-[#8C8270]">건</span>
          </div>
        </div>
        <div className="rounded-lg bg-[#F8F4EC] dark:bg-zinc-950/50 px-3 py-2">
          <div className="text-[10.5px] font-semibold text-[#8C8270] dark:text-zinc-500">신청자</div>
          <div className="mt-0.5 text-[20px] leading-none font-bold text-[#2F6F54] dark:text-emerald-300">
            {data.applicants.toLocaleString()}
            <span className="text-[11px] ml-0.5 font-medium text-[#8C8270]">명</span>
          </div>
        </div>
        <div className="rounded-lg bg-[#F8F4EC] dark:bg-zinc-950/50 px-3 py-2">
          <div className="text-[10.5px] font-semibold text-[#8C8270] dark:text-zinc-500">미진행</div>
          <div className="mt-0.5 text-[20px] leading-none font-bold text-[#8A641D] dark:text-amber-300">
            {(data.pending ?? 0).toLocaleString()}
            <span className="text-[11px] ml-0.5 font-medium text-[#8C8270]">건</span>
          </div>
        </div>
      </div>
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
    <div className="px-5 py-4 rounded-xl border border-[#E4D9C6] dark:border-zinc-800 bg-white/80 dark:bg-zinc-900 shadow-sm">
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
