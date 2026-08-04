"use client";

// 발급/결제 기간 필터 — 수강권/회원권 관리 등에서 공용 사용. 기본값 'all'(전체).

export const PERIOD_OPTIONS: { key: string; label: string }[] = [
  { key: "all", label: "전체 기간" },
  { key: "today", label: "오늘" },
  { key: "7d", label: "최근 7일" },
  { key: "month", label: "이번 달" },
  { key: "3m", label: "최근 3개월" },
  { key: "6m", label: "최근 6개월" },
  { key: "year", label: "올해" },
];

/** 선택 기간의 시작일(YMD). null 이면 전체(제한 없음). 로컬(KST) 기준. */
export function periodStartYmd(key: string): string | null {
  const now = new Date();
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  switch (key) {
    case "today":
      return ymd(now);
    case "7d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      return ymd(d);
    }
    case "month":
      return ymd(new Date(now.getFullYear(), now.getMonth(), 1));
    case "3m": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 3);
      return ymd(d);
    }
    case "6m": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 6);
      return ymd(d);
    }
    case "year":
      return ymd(new Date(now.getFullYear(), 0, 1));
    default:
      return null;
  }
}

/** dateStr(발급/결제일)이 선택 기간 안에 드는지. */
export function inPeriod(dateStr: string | null | undefined, key: string): boolean {
  if (key === "all") return true;
  const start = periodStartYmd(key);
  if (!start) return true;
  if (!dateStr) return false;
  return dateStr.slice(0, 10) >= start;
}

export function PeriodSelect({
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`px-2.5 py-1.5 rounded-lg border border-[#D9CDB8] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[12.5px] font-medium text-[#3A342A] dark:text-zinc-200 focus:outline-none focus:border-[#6B7B3A] ${className}`}
    >
      {PERIOD_OPTIONS.map((o) => (
        <option key={o.key} value={o.key}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
