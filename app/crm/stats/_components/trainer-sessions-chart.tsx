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
  /** 항목별 월 매출 (매출 차트 전용) */
  monthly_by_type?: { membership: number[]; pass: number[]; etc: number[] };
  total_by_type?: { membership: number; pass: number; etc: number };
}

/** 매출 차트에서 합산할 항목 */
type RevenueCat = "membership" | "pass" | "etc";
const REVENUE_CATS: { key: RevenueCat; label: string; hint: string }[] = [
  { key: "membership", label: "회원권", hint: "판매 직원(등록 담당) 기준" },
  { key: "pass", label: "수강권", hint: "담당 강사 기준" },
  { key: "etc", label: "기타", hint: "운동복·락커 등 대여권 · 판매 직원 기준" },
];
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
 * 강사별 월별 매출 — 다중 라인 차트 + 강사 선택 + 매출 항목(회원권/수강권/기타) 체크박스.
 * 체크한 항목만 합산해 표시한다(전부 체크 = 전체 매출, 수강권만 = 수강권 매출만).
 * 귀속: 수강권=담당강사(강사 매출 표 '매출(원)' 열과 동일), 회원권·기타=판매 직원(seller_member_id).
 */
export function TrainerRevenueChart() {
  const { getIdToken } = useAuth();
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // 합산할 매출 항목 — 기본은 전체 선택(모든 매출)
  const [cats, setCats] = useState<Set<RevenueCat>>(
    () => new Set<RevenueCat>(["membership", "pass", "etc"])
  );

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

  /** 체크한 항목만 합산한 월별 매출 (항목 정보가 없으면 전체 합계로 폴백) */
  const monthlyOf = useCallback(
    (t: TrainerRow): number[] => {
      const bt = t.monthly_by_type;
      if (!bt) return t.monthly;
      return t.monthly.map((_, i) =>
        REVENUE_CATS.reduce((sum, c) => (cats.has(c.key) ? sum + (bt[c.key][i] ?? 0) : sum), 0)
      );
    },
    [cats]
  );
  const totalOf = useCallback(
    (t: TrainerRow): number => monthlyOf(t).reduce((sum, v) => sum + v, 0),
    [monthlyOf]
  );

  const series: LineSeries[] = useMemo(() => {
    if (!data) return [];
    return data.trainers
      .filter((t) => selected.has(t.id))
      .map((t) => ({ label: t.name, color: colorOf.get(t.id) ?? "#6B7B3A", values: monthlyOf(t) }));
  }, [data, selected, colorOf, monthlyOf]);

  const toggleCat = (key: RevenueCat) =>
    setCats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

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
        <span className="text-[11.5px] text-[#8C8270] dark:text-zinc-500">
          최근 12개월 · 체크한 항목 합계
        </span>
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
          {/* 매출 항목 선택 — 모두 체크=전체 매출, 수강권만 체크=수강권 매출만 */}
          <div className="mb-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-800 bg-[#FBF7EB]/60 dark:bg-zinc-950/40 px-3 py-2">
            <span className="text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-400">매출 항목</span>
            {REVENUE_CATS.map((c) => (
              <label
                key={c.key}
                className="flex cursor-pointer select-none items-center gap-1.5 text-[12.5px] text-[#3A342A] dark:text-zinc-300"
                title={c.hint}
              >
                <input
                  type="checkbox"
                  checked={cats.has(c.key)}
                  onChange={() => toggleCat(c.key)}
                  className="h-4 w-4 accent-[#6B7B3A]"
                />
                {c.label}
              </label>
            ))}
            {cats.size === 0 && (
              <span className="text-[11.5px] font-semibold text-[#B47B2A] dark:text-amber-300">
                항목을 하나 이상 선택해 주세요
              </span>
            )}
          </div>

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
                  title={`${t.name} · 12개월 합계 ${totalOf(t).toLocaleString()}원`}
                >
                  {t.name}
                  <span className={on ? "opacity-90" : "opacity-70"}>
                    {totalOf(t).toLocaleString()}원
                  </span>
                </button>
              );
            })}
          </div>

          <CrmMultiLineChart months={data.months} series={series} unit="원" />
          <p className="mt-2 text-[11px] leading-relaxed text-[#A89B80] dark:text-zinc-500">
            수강권은 담당 강사, 회원권·기타(운동복·락커)는 판매 직원 기준으로 집계돼요. 회원권·기타는 판매 직원이
            지정된 건만 잡혀서 센터 전체 매출보다 적게 보일 수 있어요.
          </p>
        </>
      )}
    </section>
  );
}
