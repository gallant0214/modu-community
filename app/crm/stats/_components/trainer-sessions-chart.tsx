"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { CrmMultiLineChart, LineSeries } from "../../_components/crm-multi-line-chart";

interface TrainerRow {
  id: number;
  name: string;
  role: string;
  monthly: number[];
  total: number;
}
interface Resp {
  months: string[];
  trainers: TrainerRow[];
}

const COLORS = [
  "#6B7B3A",
  "#5A8BB0",
  "#C76C8E",
  "#B47B2A",
  "#8E7CC3",
  "#4FA88B",
  "#D08A3E",
  "#A8557A",
  "#5E93C4",
  "#8FA35B",
];

/**
 * 강사별 월별 수업 진행(출석완료) 수 — 다중 라인 차트 + 강사 선택.
 * 수업을 안 하는 아르바이트·FC 등은 기본 미선택(수업 0), 필요 시 체크로 표시.
 */
export function TrainerSessionsChart() {
  const { getIdToken } = useAuth();
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch("/api/crm/stats/trainer-sessions", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "조회 실패");
      setData(json);
      // 기본 선택 = 최근 12개월 수업이 1회 이상 있는 강사 (수업 안 하는 직원 제외)
      setSelected(new Set((json.trainers as TrainerRow[]).filter((t) => t.total > 0).map((t) => t.id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    load();
  }, [load]);

  const colorOf = useMemo(() => {
    const map = new Map<number, string>();
    (data?.trainers ?? []).forEach((t, i) => map.set(t.id, COLORS[i % COLORS.length]));
    return map;
  }, [data]);

  const series: LineSeries[] = useMemo(() => {
    if (!data) return [];
    return data.trainers
      .filter((t) => selected.has(t.id))
      .map((t) => ({ label: t.name, color: colorOf.get(t.id) ?? "#6B7B3A", values: t.monthly }));
  }, [data, selected, colorOf]);

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className="mt-5 px-5 py-4 rounded-xl border border-[#E4D9C6] dark:border-zinc-800 bg-white/80 dark:bg-zinc-900 shadow-sm">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
        <h3 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">
          강사별 월별 수업 진행 수
        </h3>
        <span className="text-[11.5px] text-[#8C8270] dark:text-zinc-500">최근 12개월 · 출석완료 기준</span>
      </div>

      {loading ? (
        <div className="py-10 text-center text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : error ? (
        <div className="my-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : !data || data.trainers.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-[#8C8270]">표시할 강사가 없어요.</div>
      ) : (
        <>
          {/* 강사 선택 */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {data.trainers.map((t) => {
              const on = selected.has(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => toggle(t.id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium border transition-colors ${
                    on
                      ? "border-transparent text-white"
                      : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[#8C8270] dark:text-zinc-500 hover:border-[#6B7B3A]/40"
                  }`}
                  style={on ? { background: colorOf.get(t.id) } : undefined}
                  title={`${t.name} · 12개월 합계 ${t.total}회`}
                >
                  {t.name}
                  <span className={on ? "opacity-90" : "opacity-70"}>{t.total}</span>
                </button>
              );
            })}
          </div>

          <CrmMultiLineChart months={data.months} series={series} unit="회" />
        </>
      )}
    </section>
  );
}

/**
 * 강사별 월별 매출 — 다중 라인 차트 + 강사 선택.
 * 매출 = 담당강사(trainer_member_id) 배정 PT 수강권 발급액(price_won), issued_at 기준.
 * (강사 매출 표의 '매출(원)' 열과 동일 기준)
 */
export function TrainerRevenueChart() {
  const { getIdToken } = useAuth();
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch("/api/crm/stats/trainer-revenue", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "조회 실패");
      setData(json);
      // 기본 선택 = 최근 12개월 매출이 있는 강사
      setSelected(new Set((json.trainers as TrainerRow[]).filter((t) => t.total > 0).map((t) => t.id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    load();
  }, [load]);

  const colorOf = useMemo(() => {
    const map = new Map<number, string>();
    (data?.trainers ?? []).forEach((t, i) => map.set(t.id, COLORS[i % COLORS.length]));
    return map;
  }, [data]);

  const series: LineSeries[] = useMemo(() => {
    if (!data) return [];
    return data.trainers
      .filter((t) => selected.has(t.id))
      .map((t) => ({ label: t.name, color: colorOf.get(t.id) ?? "#6B7B3A", values: t.monthly }));
  }, [data, selected, colorOf]);

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className="mt-5 px-5 py-4 rounded-xl border border-[#E4D9C6] dark:border-zinc-800 bg-white/80 dark:bg-zinc-900 shadow-sm">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
        <h3 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">
          강사별 월별 매출
        </h3>
        <span className="text-[11.5px] text-[#8C8270] dark:text-zinc-500">최근 12개월 · PT 수강권 발급 기준</span>
      </div>

      {loading ? (
        <div className="py-10 text-center text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : error ? (
        <div className="my-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : !data || data.trainers.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-[#8C8270]">표시할 강사가 없어요.</div>
      ) : (
        <>
          {/* 강사 선택 */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {data.trainers.map((t) => {
              const on = selected.has(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => toggle(t.id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium border transition-colors ${
                    on
                      ? "border-transparent text-white"
                      : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[#8C8270] dark:text-zinc-500 hover:border-[#6B7B3A]/40"
                  }`}
                  style={on ? { background: colorOf.get(t.id) } : undefined}
                  title={`${t.name} · 12개월 합계 ${t.total.toLocaleString()}원`}
                >
                  {t.name}
                  <span className={on ? "opacity-90" : "opacity-70"}>{t.total.toLocaleString()}원</span>
                </button>
              );
            })}
          </div>

          <CrmMultiLineChart months={data.months} series={series} unit="원" />
        </>
      )}
    </section>
  );
}
