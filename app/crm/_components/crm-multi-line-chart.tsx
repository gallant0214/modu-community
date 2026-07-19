"use client";

import { useState } from "react";

export interface LineSeries {
  label: string;
  color: string;
  values: number[];
}

interface Props {
  /** "YYYY-MM" 배열 */
  months: string[];
  series: LineSeries[];
  unit?: string;
  height?: number;
}

/**
 * 다중 라인 차트 (월별). 강사별 월별 수업 수 등에 사용.
 * 외부 라이브러리 없이 SVG 로 직접 렌더 ([[feedback-vercel-ssr-esm]]).
 */
export function CrmMultiLineChart({ months, series, unit = "", height = 240 }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (months.length === 0 || series.length === 0) {
    return (
      <div className="text-[12.5px] text-[#8C8270] dark:text-zinc-500 px-3 py-8 text-center">
        표시할 강사를 선택해 주세요.
      </div>
    );
  }

  const W = 640;
  const H = height;
  const padL = 34;
  const padR = 12;
  const padT = 14;
  const padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const xStep = months.length > 1 ? innerW / (months.length - 1) : innerW / 2;
  const xAt = (i: number) => padL + (months.length > 1 ? i * xStep : innerW / 2);
  const yAt = (v: number) => padT + innerH - (v / max) * innerH;
  const monthLabel = (ym: string) => `${Number(ym.slice(5, 7))}월`;

  const gridTs = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="relative w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full text-[#A89B80] dark:text-zinc-500"
        style={{ minWidth: 420 }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* 그리드 + y축 */}
        {gridTs.map((t, gi) => {
          const gy = padT + innerH * (1 - t);
          return (
            <g key={gi}>
              <line x1={padL} x2={W - padR} y1={gy} y2={gy} stroke="currentColor" strokeOpacity={0.16} />
              <text x={padL - 4} y={gy + 3} textAnchor="end" fontSize={9} fill="currentColor">
                {Math.round(max * t)}
              </text>
            </g>
          );
        })}

        {/* x축 라벨 + 호버 히트박스 */}
        {months.map((ym, i) => (
          <g key={ym}>
            <rect
              x={xAt(i) - xStep / 2}
              y={padT}
              width={xStep}
              height={innerH}
              fill="transparent"
              onMouseMove={() => setHoverIdx(i)}
            />
            <text x={xAt(i)} y={H - padB + 15} textAnchor="middle" fontSize={9} fill="currentColor">
              {monthLabel(ym)}
            </text>
          </g>
        ))}

        {/* 호버 세로 가이드 */}
        {hoverIdx !== null && (
          <line
            x1={xAt(hoverIdx)}
            x2={xAt(hoverIdx)}
            y1={padT}
            y2={padT + innerH}
            stroke="currentColor"
            strokeOpacity={0.3}
            strokeDasharray="3 3"
          />
        )}

        {/* 라인 */}
        {series.map((s) => {
          const d = s.values
            .map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`)
            .join(" ");
          return <path key={s.label} d={d} fill="none" stroke={s.color} strokeWidth={2} />;
        })}

        {/* 호버 지점 점 */}
        {hoverIdx !== null &&
          series.map((s) => (
            <circle key={s.label} cx={xAt(hoverIdx)} cy={yAt(s.values[hoverIdx] ?? 0)} r={3} fill={s.color} />
          ))}
      </svg>

      {/* 범례 */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#6B5D47] dark:text-zinc-400">
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 rounded" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>

      {/* 툴팁 */}
      {hoverIdx !== null && (
        <div className="pointer-events-none absolute right-2 top-2 z-20 rounded-md border border-[#D9CBB5] bg-[#2A251D]/95 px-2.5 py-1.5 text-[11px] font-medium text-white shadow-lg dark:border-zinc-700 dark:bg-zinc-100/95 dark:text-zinc-900">
          <div className="font-semibold mb-0.5">{monthLabel(months[hoverIdx])}</div>
          {[...series]
            .map((s) => ({ s, v: s.values[hoverIdx] ?? 0 }))
            .sort((a, b) => b.v - a.v)
            .map(({ s, v }) => (
              <div key={s.label} className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="inline-block w-2 h-2 rounded-sm" style={{ background: s.color }} />
                <span>
                  {s.label} {v.toLocaleString()}
                  {unit}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
