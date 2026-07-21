"use client";

import { useState } from "react";

export interface DualSeries {
  label: string;
  values: number[];
  dates?: string[]; // 툴팁용 (예: 2026-07)
}

const W = 700;
const H = 240;
const PAD_R = 14;
const PAD_T = 16;
const PAD_B = 26;

const PRIMARY_COLOR = "#E8863B";
const SECONDARY_COLOR = "#B8AC93";

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * p;
}

/**
 * 2개 시계열(올해/작년 등) 비교 라인+영역 차트 + 호버 툴팁.
 * 주간 출석 차트와 동일한 방식. unit="원" 이면 콤마 금액 표시.
 */
export function DualLineChart({
  xLabels,
  primary,
  secondary,
  unit = "",
}: {
  xLabels: string[];
  primary: DualSeries;
  secondary: DualSeries;
  unit?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const n = xLabels.length;
  if (n === 0) return <div className="text-[12.5px] text-[#8C8270] py-10 text-center">데이터가 없어요.</div>;

  const fmt = (v: number) => (unit === "원" ? Math.round(v).toLocaleString() : String(v));
  const padL = unit === "원" ? 62 : 34;
  const plotW = W - padL - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const maxVal = Math.max(1, ...primary.values, ...secondary.values);
  const yMax = niceMax(maxVal);
  const x = (i: number) => padL + (plotW * i) / Math.max(1, n - 1);
  const y = (v: number) => PAD_T + plotH * (1 - v / yMax);

  const linePath = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const areaPath = (vals: number[]) =>
    `${linePath(vals)} L${x(n - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;

  const gridVals = [0, 0.25, 0.5, 0.75, 1].map((r) => Math.round(yMax * r));
  const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * W;
    const idx = Math.round((vx - padL) / (plotW / Math.max(1, n - 1)));
    setHover(Math.max(0, Math.min(n - 1, idx)));
  };

  return (
    <div>
      {/* 범례 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-[12.5px]">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: SECONDARY_COLOR }} />
          <span className="text-[#6B5D47] dark:text-zinc-300">{secondary.label}</span>
          <b className="text-[#2A251D] dark:text-zinc-100">{fmt(sum(secondary.values))}{unit}</b>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: PRIMARY_COLOR }} />
          <span className="text-[#6B5D47] dark:text-zinc-300">{primary.label}</span>
          <b className="text-[#2A251D] dark:text-zinc-100">{fmt(sum(primary.values))}{unit}</b>
        </span>
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          <defs>
            <linearGradient id="dualFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PRIMARY_COLOR} stopOpacity="0.28" />
              <stop offset="100%" stopColor={PRIMARY_COLOR} stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {gridVals.map((gv, i) => {
            const gy = y(gv);
            return (
              <g key={i}>
                <line x1={padL} y1={gy} x2={W - PAD_R} y2={gy} stroke="#E8E0D0" strokeWidth={1} strokeDasharray="3 3" className="dark:opacity-30" />
                <text x={padL - 6} y={gy + 3} textAnchor="end" fontSize={10} fill="#A89B80">
                  {fmt(gv)}
                </text>
              </g>
            );
          })}

          {hover !== null && (
            <line x1={x(hover)} y1={PAD_T} x2={x(hover)} y2={PAD_T + plotH} stroke="#C9BCA0" strokeWidth={1} />
          )}

          <path d={areaPath(primary.values)} fill="url(#dualFill)" />
          <path d={linePath(secondary.values)} fill="none" stroke={SECONDARY_COLOR} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          <path d={linePath(primary.values)} fill="none" stroke={PRIMARY_COLOR} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

          {secondary.values.map((v, i) => (
            <circle key={`s${i}`} cx={x(i)} cy={y(v)} r={hover === i ? 4 : 0} fill={SECONDARY_COLOR} />
          ))}
          {primary.values.map((v, i) => (
            <circle key={`p${i}`} cx={x(i)} cy={y(v)} r={hover === i ? 5 : 0} fill={PRIMARY_COLOR} />
          ))}

          {xLabels.map((lab, i) => {
            // 라벨이 많으면 일부만 표기
            const showEvery = n > 12 ? 3 : n > 7 ? 2 : 1;
            if (i % showEvery !== 0 && i !== n - 1 && hover !== i) return null;
            return (
              <text
                key={i}
                x={x(i)}
                y={H - 6}
                textAnchor="middle"
                fontSize={10}
                fill={hover === i ? "#3A342A" : "#8C8270"}
                fontWeight={hover === i ? 700 : 400}
              >
                {lab}
              </text>
            );
          })}
        </svg>

        {hover !== null && (
          <div
            className="absolute pointer-events-none -translate-x-1/2 -translate-y-full bg-white dark:bg-zinc-800 border border-[#E8E0D0] dark:border-zinc-700 rounded-lg shadow-lg px-3 py-2 text-[11.5px] whitespace-nowrap z-10"
            style={{ left: `${(x(hover) / W) * 100}%`, top: "36%" }}
          >
            <div className="font-bold text-[#2A251D] dark:text-zinc-100 mb-1">{xLabels[hover]}</div>
            <div className="flex items-center gap-1.5 text-[#6B5D47] dark:text-zinc-300">
              <span className="w-2 h-2 rounded-full" style={{ background: PRIMARY_COLOR }} />
              {primary.label}
              {primary.dates?.[hover] && <span className="text-[#A89B80]">{primary.dates[hover]}</span>}
              <b className="ml-1 text-[#2A251D] dark:text-zinc-100">{fmt(primary.values[hover])}{unit}</b>
            </div>
            <div className="flex items-center gap-1.5 text-[#6B5D47] dark:text-zinc-300 mt-0.5">
              <span className="w-2 h-2 rounded-full" style={{ background: SECONDARY_COLOR }} />
              {secondary.label}
              {secondary.dates?.[hover] && <span className="text-[#A89B80]">{secondary.dates[hover]}</span>}
              <b className="ml-1 text-[#2A251D] dark:text-zinc-100">{fmt(secondary.values[hover])}{unit}</b>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
