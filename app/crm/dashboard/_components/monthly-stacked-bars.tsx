"use client";

import { useState } from "react";

export interface Series {
  label: string;
  color: string;
  values: number[]; // months 와 같은 길이
}

interface Props {
  /** "YYYY-MM" 배열 */
  months: string[];
  series: Series[];
  /** count = 절대값 누적 막대, percent = 100% 띠그래프 */
  mode?: "count" | "percent";
  unit?: string;
  height?: number;
}

/**
 * 월별 누적 막대(띠그래프). 외부 라이브러리 없이 SVG 로 직접 렌더.
 * - percent 모드: 각 달을 100%로 채우는 구성 비율 띠그래프
 * - count 모드: 절대값 누적 막대 (단일 시리즈면 일반 막대)
 */
export function MonthlyStackedBars({ months, series, mode = "count", unit = "명", height = 200 }: Props) {
  const [hover, setHover] = useState<{ x: number; y: number; idx: number; flip: boolean } | null>(null);

  if (months.length === 0 || series.length === 0) {
    return (
      <div className="text-[12.5px] text-[#8C8270] dark:text-zinc-500 px-3 py-6 text-center">
        표시할 데이터가 없습니다.
      </div>
    );
  }

  const W = 640;
  const H = height;
  const padL = 34;
  const padR = 10;
  const padT = 12;
  const padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const totals = months.map((_, i) => series.reduce((s, ser) => s + (ser.values[i] ?? 0), 0));
  const maxTotal = Math.max(...totals, 1);
  const colW = innerW / months.length;
  const barW = Math.min(30, colW * 0.6);

  // y축 눈금
  const axisMax = mode === "percent" ? 100 : maxTotal;
  const gridTs = [0, 0.25, 0.5, 0.75, 1];

  // 라벨: "YYYY-MM-DD"→"M/D", "YYYY-MM"→"M월", "YYYY"→"YYYY"
  const monthLabel = (k: string) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(k)) return `${Number(k.slice(5, 7))}/${Number(k.slice(8, 10))}`;
    if (/^\d{4}-\d{2}$/.test(k)) return `${Number(k.slice(5, 7))}월`;
    if (/^\d{4}$/.test(k)) return `${k}년`;
    return k;
  };

  return (
    <div className="relative w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full text-[#A89B80] dark:text-zinc-500" style={{ minWidth: 420 }}>
        {/* 그리드 + y축 라벨 */}
        {gridTs.map((t, gi) => {
          const gy = padT + innerH * (1 - t);
          return (
            <g key={gi}>
              <line x1={padL} x2={W - padR} y1={gy} y2={gy} stroke="currentColor" strokeOpacity={0.16} />
              <text x={padL - 4} y={gy + 3} textAnchor="end" fontSize={9} fill="currentColor">
                {mode === "percent" ? `${Math.round(axisMax * t)}%` : Math.round(axisMax * t)}
              </text>
            </g>
          );
        })}

        {/* 막대 */}
        {months.map((ym, i) => {
          const cx = padL + colW * i + colW / 2;
          const total = totals[i] || 0;
          const denom = mode === "percent" ? total || 1 : axisMax;
          let acc = 0;
          return (
            <g
              key={ym}
              onMouseMove={(e) => {
                const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
                if (!rect) return;
                const mx = e.clientX - rect.left;
                setHover({ x: mx, y: e.clientY - rect.top + 12, idx: i, flip: mx > rect.width * 0.6 });
              }}
              onMouseLeave={() => setHover(null)}
            >
              {/* 히트박스 */}
              <rect x={cx - colW / 2} y={padT} width={colW} height={innerH} fill="transparent" />
              {series.map((ser, si) => {
                const v = ser.values[i] ?? 0;
                if (v <= 0) return null;
                const h = (v / denom) * innerH;
                const yTop = padT + innerH - acc - h;
                acc += h;
                return (
                  <rect
                    key={si}
                    x={cx - barW / 2}
                    y={yTop}
                    width={barW}
                    height={Math.max(0, h)}
                    fill={ser.color}
                    rx={series.length === 1 ? 2 : 0}
                  />
                );
              })}
              {/* 총합/값 라벨 (상단) — 버킷 많으면 생략(툴팁으로 확인) */}
              {mode === "count" && total > 0 && months.length <= 14 && (
                <text x={cx} y={padT + innerH - (total / axisMax) * innerH - 3} textAnchor="middle" fontSize={9} fill="#6B5D47">
                  {total}
                </text>
              )}
              {/* x축 라벨 (버킷 많으면 일부만) */}
              {(months.length <= 14 || i % Math.ceil(months.length / 12) === 0) && (
                <text x={cx} y={H - padB + 15} textAnchor="middle" fontSize={9} fill="currentColor">
                  {monthLabel(ym)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* 범례 */}
      {series.length > 1 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#6B5D47] dark:text-zinc-400">
          {series.map((ser) => (
            <span key={ser.label} className="inline-flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: ser.color }} />
              {ser.label}
            </span>
          ))}
        </div>
      )}

      {/* 툴팁 */}
      {hover && (
        <div
          className="pointer-events-none absolute z-20 whitespace-nowrap rounded-md border border-[#D9CBB5] bg-[#2A251D] px-2.5 py-1.5 text-[11px] font-medium text-white shadow-lg dark:border-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
          style={{
            left: hover.flip ? hover.x - 12 : hover.x + 12,
            top: hover.y,
            transform: hover.flip ? "translateX(-100%)" : undefined,
          }}
        >
          <div className="font-semibold mb-0.5">{monthLabel(months[hover.idx])}</div>
          {series.map((ser) => {
            const v = ser.values[hover.idx] ?? 0;
            const total = totals[hover.idx] || 0;
            const pct = total > 0 ? Math.round((v / total) * 100) : 0;
            return (
              <div key={ser.label} className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="inline-block w-2 h-2 rounded-sm" style={{ background: ser.color }} />
                <span>
                  {ser.label} {v.toLocaleString()}
                  {unit}
                  {series.length > 1 && mode === "percent" ? ` (${pct}%)` : ""}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
