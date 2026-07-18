"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { MonthlyStackedBars, Series } from "./monthly-stacked-bars";

interface CustomerStatus {
  months: string[];
  validCount: number[];
  gender: { male: number[]; female: number[]; none: number[] };
  ageBuckets: string[];
  age: Record<string, number[]>;
  newMembership: number[];
  newPass: number[];
  visited: number[];
  churn: number[];
}

const AGE_COLORS = ["#8FB0C9", "#5A8BB0", "#6B7B3A", "#A8B87A", "#B47B2A", "#C76C8E", "#B8AE98"];

export function CustomerStatusView() {
  const { getIdToken } = useAuth();
  const [data, setData] = useState<CustomerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch("/api/crm/dashboard/customer-status", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "조회 실패");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <div className="py-16 text-center text-[13px] text-[#8C8270]">불러오는 중…</div>;
  }
  if (error) {
    return (
      <div className="my-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
        {error}
      </div>
    );
  }
  if (!data) return null;

  const genderSeries: Series[] = [
    { label: "남성", color: "#5A8BB0", values: data.gender.male },
    { label: "여성", color: "#C76C8E", values: data.gender.female },
    { label: "미등록", color: "#C9BFA8", values: data.gender.none },
  ];
  const ageSeries: Series[] = data.ageBuckets.map((b, i) => ({
    label: b,
    color: AGE_COLORS[i % AGE_COLORS.length],
    values: data.age[b] ?? data.months.map(() => 0),
  }));
  const newSeries: Series[] = [
    { label: "회원권", color: "#6B7B3A", values: data.newMembership },
    { label: "수강권", color: "#B47B2A", values: data.newPass },
  ];

  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400">
        최근 12개월 고객 현황입니다. 각 막대에 마우스를 올리면 상세 값이 표시돼요.
      </p>

      {/* 유효고객 수 */}
      <ChartCard title="유효고객 수" subtitle="그 달에 유효한 회원권·수강권을 보유한 고객">
        <MonthlyStackedBars
          months={data.months}
          series={[{ label: "유효고객", color: "#6B7B3A", values: data.validCount }]}
          mode="count"
        />
      </ChartCard>

      <div className="grid gap-3 md:grid-cols-2">
        {/* 성별 구성 */}
        <ChartCard title="유효고객 성별 구성" subtitle="100% 띠그래프">
          <MonthlyStackedBars months={data.months} series={genderSeries} mode="percent" />
        </ChartCard>

        {/* 연령대 구성 */}
        <ChartCard title="유효고객 연령대 구성" subtitle="100% 띠그래프">
          <MonthlyStackedBars months={data.months} series={ageSeries} mode="percent" />
        </ChartCard>
      </div>

      {/* 신규 등록 */}
      <ChartCard title="신규 등록 고객 수" subtitle="그 달 회원권·수강권을 새로 발급받은 고객">
        <MonthlyStackedBars months={data.months} series={newSeries} mode="count" />
      </ChartCard>

      <div className="grid gap-3 md:grid-cols-2">
        {/* 방문(출석) */}
        <ChartCard title="방문(출석) 고객 수" subtitle="그 달 1회 이상 출석한 고객">
          <MonthlyStackedBars
            months={data.months}
            series={[{ label: "방문고객", color: "#5A8BB0", values: data.visited }]}
            mode="count"
          />
        </ChartCard>

        {/* 이탈 */}
        <ChartCard title="이탈 고객 수" subtitle="마지막 이용권이 그 달에 만료된 고객">
          <MonthlyStackedBars
            months={data.months}
            series={[{ label: "이탈고객", color: "#C76C8E", values: data.churn }]}
            mode="count"
          />
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-4 rounded-xl border border-[#E4D9C6] dark:border-zinc-800 bg-white/80 dark:bg-zinc-900 shadow-sm">
      <h3 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">{title}</h3>
      {subtitle && <p className="text-[11.5px] text-[#8C8270] dark:text-zinc-500 mb-2">{subtitle}</p>}
      {!subtitle && <div className="mb-2" />}
      {children}
    </div>
  );
}
