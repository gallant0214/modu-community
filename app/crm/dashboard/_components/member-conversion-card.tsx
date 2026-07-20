"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { MonthlyStackedBars } from "./monthly-stacked-bars";

/**
 * 신규 → 재등록 전환률 (월별).
 * 그 달 '첫 등록(신규)'한 회원 중, 이후 재등록(재발급)한 회원의 비율.
 * 회원 통계 섹션에 카드로 표시.
 */
export function MemberConversionCard() {
  const { getIdToken } = useAuth();
  const [months, setMonths] = useState<string[]>([]);
  const [rates, setRates] = useState<number[]>([]);
  const [newReg, setNewReg] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch("/api/crm/dashboard/customer-status?period=1y", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) return;
      const d = await res.json();
      const mo: string[] = d.months ?? [];
      const nr: number[] = d.newReg ?? [];
      const cf: number[] = d.convertedFromNew ?? [];
      setMonths(mo);
      setNewReg(nr);
      setRates(mo.map((_, i) => (nr[i] > 0 ? Math.round((cf[i] / nr[i]) * 100) : 0)));
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

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

  // 최근 12개월 평균 전환률 (신규 있는 달만)
  const withNew = months.map((_, i) => i).filter((i) => newReg[i] > 0);
  const avg =
    withNew.length > 0
      ? Math.round(withNew.reduce((s, i) => s + rates[i], 0) / withNew.length)
      : 0;

  return (
    <div className="rounded-xl border border-[#E4D9C6] dark:border-zinc-800 bg-white/80 dark:bg-zinc-900 px-5 py-4 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">
          신규 → 재등록 전환률
        </h3>
        <span className="text-[12px] font-semibold text-[#6B7B3A] dark:text-[#A8B87A]">
          평균 {avg}%
        </span>
      </div>
      <p className="text-[11.5px] text-[#8C8270] dark:text-zinc-500 mb-2">
        그 달 처음 등록한 회원 중 이후 재등록한 비율 (월별) · 최근 12개월
      </p>
      <MonthlyStackedBars
        months={months}
        series={[{ label: "전환률", color: "#6B7B3A", values: rates }]}
        mode="count"
        unit="%"
      />
      <p className="mt-1.5 text-[11px] text-[#A89B80] dark:text-zinc-500 leading-relaxed">
        막대에 마우스를 올리면 전환률이 표시돼요. 최근 달일수록 재등록까지의 기간이 짧아 낮게 나올 수 있어요.
      </p>
    </div>
  );
}
