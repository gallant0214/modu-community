"use client";

import { useState } from "react";
import { formatWon } from "../../_components/crm-labels";

type SliceKey = "net" | "labor" | "other";
type ActiveKey = SliceKey | "expense" | null;

type Slice = {
  key: SliceKey;
  label: string;
  /** 매출 대비 비율 (0~1) */
  ratio: number;
  amountWon: number;
  stroke: string;
  swatch: string;
};

const pct = (r: number) => `${(r * 100).toFixed(1)}%`;

const SIZE = 128;
const STROKE = 16;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;
/** 조각 사이 2px 여백 (배경색이 비쳐 보이게) */
const GAP = 2;

/**
 * 정산 탭 순이익 카드 오른쪽 원그래프 (2026-11-16 사용자 요청).
 *
 * 순이익률 + 매출 대비 지출 = 100%, 인건비는 지출 안에 들어 있다.
 * 세 숫자를 그대로 조각으로 그리면 합이 100%를 넘으므로 매출 100% 를
 * 순이익 · 인건비 · 그 외 지출(= 지출 − 인건비) 세 조각으로 나눠 그린다.
 * (추가 수입이 있으면 비율 합이 100%를 넘을 수 있어 조각 크기는 합계로 나눠 맞춘다)
 *
 * 색: dataviz 검증기 all-pairs 통과 — 라이트 #5F7A1F·#3F7DC0·#C76C8E / 다크 #7A9A2E·#3987E5·#D55181.
 * 순이익이 0 이하면 원그래프로 나타낼 수 없어 부모가 비율 칩을 대신 보여 준다.
 */
export function ProfitDonut({
  netMargin,
  expenseRatio,
  laborRatio,
  netProfitWon,
  laborWon,
  otherExpenseWon,
}: {
  netMargin: number;
  expenseRatio: number;
  laborRatio: number;
  netProfitWon: number;
  laborWon: number;
  otherExpenseWon: number;
}) {
  const [active, setActive] = useState<ActiveKey>(null);

  const slices: Slice[] = [
    {
      key: "net",
      label: "순이익",
      ratio: Math.max(0, netMargin),
      amountWon: netProfitWon,
      stroke: "stroke-[#5F7A1F] dark:stroke-[#7A9A2E]",
      swatch: "bg-[#5F7A1F] dark:bg-[#7A9A2E]",
    },
    {
      key: "labor",
      label: "인건비",
      ratio: Math.max(0, laborRatio),
      amountWon: laborWon,
      stroke: "stroke-[#3F7DC0] dark:stroke-[#3987E5]",
      swatch: "bg-[#3F7DC0] dark:bg-[#3987E5]",
    },
    {
      key: "other",
      label: "그 외 지출",
      ratio: Math.max(0, expenseRatio - laborRatio),
      amountWon: otherExpenseWon,
      stroke: "stroke-[#C76C8E] dark:stroke-[#D55181]",
      swatch: "bg-[#C76C8E] dark:bg-[#D55181]",
    },
  ];
  const total = slices.reduce((s, x) => s + x.ratio, 0);
  if (total <= 0) return null;

  const visible = slices.filter((s) => s.ratio > 0);
  const gap = visible.length > 1 ? GAP : 0;
  let offset = 0;
  const arcs = slices.map((s) => {
    const len = (s.ratio / total) * CIRC;
    const arc = { ...s, dash: Math.max(0, len - gap), offset };
    offset += len;
    return arc;
  });

  const isOn = (k: SliceKey) => active === null || active === k || (active === "expense" && k !== "net");

  // 가운데 글씨 — 기본은 순이익률, 조각·범례에 올리면 그 항목
  const center = (() => {
    if (active === "expense") return { label: "매출 대비 지출", value: pct(expenseRatio), won: laborWon + otherExpenseWon };
    const s = slices.find((x) => x.key === active);
    if (s) return { label: s.key === "net" ? "순이익률" : s.key === "labor" ? "인건비 비중" : s.label, value: pct(s.ratio), won: s.amountWon };
    return { label: "순이익률", value: pct(netMargin), won: null as number | null };
  })();

  const row = (
    key: ActiveKey,
    label: string,
    value: string,
    swatch: string | null,
    indent = false
  ) => (
    <li
      key={label}
      className={`flex items-center justify-between gap-3 rounded-md px-1.5 py-0.5 cursor-default ${
        active === key ? "bg-white/70 dark:bg-zinc-800/70" : ""
      } ${indent ? "pl-4" : ""}`}
      onMouseEnter={() => setActive(key)}
      onMouseLeave={() => setActive(null)}
    >
      <span className="flex items-center gap-1.5 text-[12px] text-[#6B5D47] dark:text-zinc-400">
        {swatch ? (
          <span className={`inline-block h-2.5 w-2.5 rounded-[3px] ${swatch}`} aria-hidden />
        ) : (
          <span className="inline-block h-2.5 w-2.5" aria-hidden />
        )}
        {label}
      </span>
      <strong className="text-[12.5px] tabular-nums text-[#2A251D] dark:text-zinc-100">{value}</strong>
    </li>
  );

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={`순이익률 ${pct(netMargin)}, 매출 대비 지출 ${pct(expenseRatio)}, 인건비 비중 ${pct(laborRatio)}`}
        >
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {arcs.map((a) =>
              a.dash > 0 ? (
                <circle
                  key={a.key}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={R}
                  fill="none"
                  strokeWidth={STROKE}
                  strokeDasharray={`${a.dash} ${CIRC - a.dash}`}
                  strokeDashoffset={-a.offset}
                  className={`${a.stroke} transition-opacity duration-150 ${isOn(a.key) ? "opacity-100" : "opacity-30"}`}
                  onMouseEnter={() => setActive(a.key)}
                  onMouseLeave={() => setActive(null)}
                >
                  <title>{`${a.label} ${pct(a.ratio)} · ${formatWon(a.amountWon)}원`}</title>
                </circle>
              ) : null
            )}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10.5px] leading-tight text-[#8C8270] dark:text-zinc-500">{center.label}</span>
          <span className="text-[16px] font-bold leading-tight tabular-nums text-[#2A251D] dark:text-zinc-100">
            {center.value}
          </span>
          {center.won !== null && (
            <span className="text-[10px] leading-tight tabular-nums text-[#8C8270] dark:text-zinc-500">
              {formatWon(center.won)}원
            </span>
          )}
        </div>
      </div>
      <ul className="min-w-[150px] space-y-0.5">
        {row("net", "순이익률", pct(netMargin), slices[0].swatch)}
        {row("expense", "매출 대비 지출", pct(expenseRatio), null)}
        {row("labor", "인건비 비중", pct(laborRatio), slices[1].swatch, true)}
        {row("other", "그 외 지출", pct(Math.max(0, expenseRatio - laborRatio)), slices[2].swatch, true)}
      </ul>
    </div>
  );
}
