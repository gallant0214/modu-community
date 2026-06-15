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

const DONUT_COLORS = ["#6B7B3A", "#B47B2A", "#A8B87A", "#E8C088", "#8C8270"];

export default function CrmDashboardPage() {
  const { getIdToken } = useAuth();
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [monthly, setMonthly] = useState<MonthlyResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const [a, b] = await Promise.all([
        fetch("/api/crm/stats/trend", { headers: { authorization: `Bearer ${token}` } }),
        fetch("/api/crm/stats/monthly", { headers: { authorization: `Bearer ${token}` } }),
      ]);
      if (!a.ok || !b.ok) {
        const err = !a.ok ? await a.json() : await b.json();
        throw new Error(err?.error || "조회 실패");
      }
      const tr = await a.json();
      const mo = await b.json();
      setTrend(tr.months ?? []);
      setMonthly(mo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="px-5 md:px-8 py-6 md:py-8 max-w-6xl mx-auto">
      <header className="mb-5">
        <h1 className="text-[18px] md:text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
          대시보드
        </h1>
        <p className="mt-1 text-[13px] text-[#6B5D47] dark:text-zinc-400">
          이번달 매출과 결제 방법을 한눈에 확인해요.
        </p>
      </header>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : (
        <div className="space-y-5">
          {/* 이번달 KPI 4개 */}
          {monthly && (
            <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard label="이번달 등록 회원" value={`${monthly.summary.newMembers}명`} />
              <KpiCard label="이번달 PT매출" value={`${formatWon(monthly.summary.totalRevenue)}원`} accent />
              <KpiCard label="발급 수강권" value={`${monthly.summary.totalPassCount}건`} />
              <KpiCard
                label="활동 강사"
                value={`${monthly.trainers.filter((t) => t.passes.total > 0 || t.reservations.attended > 0).length}명`}
              />
            </section>
          )}

          <section className="grid md:grid-cols-3 gap-3">
            <div className="md:col-span-2 px-5 py-4 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
              <h2 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-2">
                월별 PT매출 추이 (12개월)
              </h2>
              <CrmLineChart
                points={trend.map((m) => ({ label: m.ym.slice(2).replace("-", "/"), value: m.revenue }))}
                unit="원"
              />
            </div>
            <div className="px-5 py-4 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
              <h2 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-2">
                이번달 결제 방법
              </h2>
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

          {monthly && monthly.trainers.length > 0 && (
            <section className="grid md:grid-cols-2 gap-3">
              <RankBox
                title="이번달 PT매출 랭킹"
                rows={[...monthly.trainers]
                  .sort((a, b) => b.passes.revenue - a.passes.revenue)
                  .slice(0, 5)
                  .map((t) => ({ label: t.name, value: `${formatWon(t.passes.revenue)}원` }))}
              />
              <RankBox
                title="이번달 수업완료 랭킹"
                rows={[...monthly.trainers]
                  .sort((a, b) => b.reservations.attended - a.reservations.attended)
                  .slice(0, 5)
                  .map((t) => ({ label: t.name, value: `${t.reservations.attended}회` }))}
              />
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="px-4 py-3.5 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
      <div className="text-[11.5px] text-[#A89B80] dark:text-zinc-500">{label}</div>
      <div className={`mt-1 text-[18px] font-bold ${accent ? "text-[#6B7B3A] dark:text-[#A8B87A]" : "text-[#2A251D] dark:text-zinc-100"}`}>
        {value}
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
    <div className="px-5 py-4 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
      <h2 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-2">{title}</h2>
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
