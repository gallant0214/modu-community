"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { MonthlyStackedBars } from "./monthly-stacked-bars";

interface YearData {
  months: string[]; // "YYYY-MM" 1~12월
  expireCohort: number[];
  expireConverted: number[];
  reExpireCohort: number[];
  reExpireConverted: number[];
  newReg: number[];
  inProgressIndex: number; // 진행 중인 달 (올해만 해당, 작년은 -1)
}

const EMPTY: YearData = {
  months: [],
  expireCohort: [],
  expireConverted: [],
  reExpireCohort: [],
  reExpireConverted: [],
  newReg: [],
  inProgressIndex: -1,
};

/** 비율(%) — 분모 0이면 0 */
function rate(num: number[], den: number[], i: number): number {
  return (den[i] ?? 0) > 0 ? Math.round(((num[i] ?? 0) / den[i]) * 100) : 0;
}

/**
 * 신규 → 재등록 / 재등록 → 재등록 전환률 + 신규 등록 수 (월별).
 * 막대 = 올해(1~12월), 꺾은선 = 작년 같은 달 — 한 그래프에 겹쳐 비교.
 *
 * 🚨 진행 중인 달은 분모(그 달 만료자)가 '오늘까지 만료된 건'만 잡히므로
 *    평균에서 제외하고 '진행 중' 으로 표시한다(API inProgressIndex).
 */
export function MemberConversionCard() {
  const { getIdToken } = useAuth();
  const [years] = useState(() => {
    const y = new Date().getFullYear();
    return { thisYear: y, lastYear: y - 1 };
  });
  const { thisYear, lastYear } = years;
  const [cur, setCur] = useState<YearData>(EMPTY);
  const [prev, setPrev] = useState<YearData>(EMPTY);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const token = await getIdToken();
      if (!token) return;
      const h = { authorization: `Bearer ${token}` };
      const [rc, rp] = await Promise.all([
        fetch(`/api/crm/dashboard/customer-status?year=${thisYear}`, { headers: h, cache: "no-store" }),
        fetch(`/api/crm/dashboard/customer-status?year=${lastYear}`, { headers: h, cache: "no-store" }),
      ]);
      if (rc.ok) {
        const d = await rc.json();
        setCur({
          ...EMPTY,
          ...d,
          inProgressIndex: typeof d.inProgressIndex === "number" ? d.inProgressIndex : -1,
        });
      }
      if (rp.ok) {
        const d = await rp.json();
        setPrev({ ...EMPTY, ...d, inProgressIndex: -1 });
      }
    } finally {
      setLoading(false);
    }
  }, [getIdToken, thisYear, lastYear]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="rounded-xl border border-[#E4D9C6] dark:border-zinc-800 bg-white/80 dark:bg-zinc-900 px-5 py-4 shadow-sm text-[12.5px] text-[#8C8270]">
        불러오는 중…
      </div>
    );
  }

  const months = cur.months.length > 0 ? cur.months : prev.months;
  const ip = cur.inProgressIndex;

  // 올해 막대 / 작년 꺾은선 — 작년 분모가 0인 달은 선을 끊는다(null)
  const curRates = months.map((_, i) => rate(cur.expireConverted, cur.expireCohort, i));
  const prevRates = months.map((_, i) =>
    (prev.expireCohort[i] ?? 0) > 0 ? rate(prev.expireConverted, prev.expireCohort, i) : null
  );
  const curReRates = months.map((_, i) => rate(cur.reExpireConverted, cur.reExpireCohort, i));
  const prevReRates = months.map((_, i) =>
    (prev.reExpireCohort[i] ?? 0) > 0 ? rate(prev.reExpireConverted, prev.reExpireCohort, i) : null
  );
  const curNew = months.map((_, i) => cur.newReg[i] ?? 0);
  const prevNew = months.map((_, i) => (prev.newReg.length > i ? prev.newReg[i] ?? 0 : null));

  // 평균 — 분모 없는 달 제외. 올해는 진행 중인 달도 제외(아직 만료가 다 안 끝남).
  const avgOf = (num: number[], den: number[], skipInProgress: boolean) => {
    let n = 0;
    let d = 0;
    for (let i = 0; i < months.length; i++) {
      if (skipInProgress && i === ip) continue;
      if ((den[i] ?? 0) <= 0) continue;
      n += num[i] ?? 0;
      d += den[i] ?? 0;
    }
    return d > 0 ? Math.round((n / d) * 100) : 0;
  };
  const avg = avgOf(cur.expireConverted, cur.expireCohort, true);
  const reAvg = avgOf(cur.reExpireConverted, cur.reExpireCohort, true);
  // 작년은 12개월이 모두 끝났으므로 전체 달로 평균
  const prevAvg = avgOf(prev.expireConverted, prev.expireCohort, false);
  const prevReAvg = avgOf(prev.reExpireConverted, prev.reExpireCohort, false);
  const newTotal = curNew.reduce((s, v) => s + v, 0);
  const prevNewTotal = prev.newReg.reduce((s, v) => s + v, 0);

  const progressNote = ip >= 0 ? ` · ${Number(months[ip]?.slice(5, 7))}월은 진행 중(평균 제외)` : "";
  const BAR = `올해(${thisYear})`;
  const LINE = `작년(${lastYear})`;

  return (
    <div className="rounded-xl border border-[#E4D9C6] dark:border-zinc-800 bg-white/80 dark:bg-zinc-900 px-5 py-4 shadow-sm space-y-5">
      {/* 신규 → 재등록 */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">
            신규 → 재등록 전환률
          </h3>
          <span className="text-[12px] font-semibold">
            <span className="text-[#C76C8E] dark:text-[#E9AFC3]">작년 평균 {prevAvg}%</span>
            <span className="mx-1 font-normal text-[#C9BFA8]">·</span>
            <span className="text-[#6B7B3A] dark:text-[#A8B87A]">올해 평균 {avg}%</span>
          </span>
        </div>
        <p className="text-[11.5px] text-[#8C8270] dark:text-zinc-500 mb-2">
          그 달에 <b>신규 회원권이 만료</b>된 회원 중 재등록한 비율 · 막대 {BAR} / 선 {LINE}
          {progressNote}
        </p>
        <MonthlyStackedBars
          months={months}
          series={[{ label: BAR, color: "#6B7B3A", values: curRates }]}
          line={{ label: LINE, color: "#C76C8E", values: prevRates }}
          mode="count"
          unit="%"
          hoverNote={(i) =>
            `${thisYear} 재등록 ${cur.expireConverted[i] ?? 0}명/만료 ${cur.expireCohort[i] ?? 0}명` +
            ` · ${lastYear} 재등록 ${prev.expireConverted[i] ?? 0}명/만료 ${prev.expireCohort[i] ?? 0}명` +
            (i === ip ? " (진행 중 · 오늘까지)" : "")
          }
        />
      </div>

      {/* 재등록 → 재등록 */}
      <div className="pt-1 border-t border-[#EFE7D8] dark:border-zinc-800">
        <div className="flex items-center justify-between mb-1 mt-3">
          <h3 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">
            재등록 → 재등록 전환률
          </h3>
          <span className="text-[12px] font-semibold">
            <span className="text-[#5A8BB0] dark:text-[#8FC4E8]">작년 평균 {prevReAvg}%</span>
            <span className="mx-1 font-normal text-[#C9BFA8]">·</span>
            <span className="text-[#B47B2A] dark:text-[#D8A24A]">올해 평균 {reAvg}%</span>
          </span>
        </div>
        <p className="text-[11.5px] text-[#8C8270] dark:text-zinc-500 mb-2">
          그 달에 <b>재등록 이용권이 만료</b>된 건 중 다시 재등록한 비율 · 막대 {BAR} / 선 {LINE}
          {progressNote}
        </p>
        <MonthlyStackedBars
          months={months}
          series={[{ label: BAR, color: "#B47B2A", values: curReRates }]}
          line={{ label: LINE, color: "#5A8BB0", values: prevReRates }}
          mode="count"
          unit="%"
          hoverNote={(i) =>
            `${thisYear} 재등록 ${cur.reExpireConverted[i] ?? 0}건/만료 ${cur.reExpireCohort[i] ?? 0}건` +
            ` · ${lastYear} 재등록 ${prev.reExpireConverted[i] ?? 0}건/만료 ${prev.reExpireCohort[i] ?? 0}건` +
            (i === ip ? " (진행 중 · 오늘까지)" : "")
          }
        />
      </div>

      {/* 신규 등록 수 */}
      <div className="pt-1 border-t border-[#EFE7D8] dark:border-zinc-800">
        <div className="flex items-center justify-between mb-1 mt-3">
          <h3 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">
            신규 등록 수
          </h3>
          <span className="text-[12px] font-semibold">
            <span className="text-[#C76C8E] dark:text-[#E9AFC3]">
              작년 {prevNewTotal.toLocaleString()}명
            </span>
            <span className="mx-1 font-normal text-[#C9BFA8]">·</span>
            <span className="text-[#5A8BB0] dark:text-[#8FC4E8]">
              올해 {newTotal.toLocaleString()}명
            </span>
          </span>
        </div>
        <p className="text-[11.5px] text-[#8C8270] dark:text-zinc-500 mb-2">
          그 달에 <b>처음 상품을 등록</b>한 회원 수 · 막대 {BAR} / 선 {LINE}
        </p>
        <MonthlyStackedBars
          months={months}
          series={[{ label: BAR, color: "#5A8BB0", values: curNew }]}
          line={{ label: LINE, color: "#C76C8E", values: prevNew }}
          mode="count"
          unit="명"
          hoverNote={(i) => `${thisYear} ${cur.newReg[i] ?? 0}명 · ${lastYear} ${prev.newReg[i] ?? 0}명`}
        />
      </div>

      <p className="text-[11px] text-[#A89B80] dark:text-zinc-500 leading-relaxed">
        재등록 판정은 <b>첫 상품 이후 추가 발급이 있었는지</b>로 봅니다(만료 전 미리 재등록한 경우도 포함).
        진행 중인 달은 아직 만료가 끝나지 않아 <b>오늘까지 만료된 건</b>만 분모에 넣고 평균에서 제외합니다.
      </p>
    </div>
  );
}
