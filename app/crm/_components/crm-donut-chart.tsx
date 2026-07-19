"use client";

import { useState } from "react";
import type { MouseEvent } from "react";

interface Slice {
  label: string;
  value: number;
  color: string;
}

interface Props {
  slices: Slice[];
  /** 차트 크기 (정사각형 픽셀) */
  size?: number;
  /** 툴팁 값 표시 방식 */
  valueKind?: "money" | "count" | "plain";
  /** 범례에 값도 함께 표시 */
  showLegendValue?: boolean;
  /** 범례 위치 */
  legendPosition?: "side" | "bottom";
}

/**
 * 도넛 차트 — SVG arc 직접 렌더 (PDF 1-1 결제방법 도넛).
 */
export function CrmDonutChart({
  slices,
  size = 180,
  valueKind = "count",
  showLegendValue = false,
  legendPosition = "side",
}: Props) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string; flip: boolean } | null>(null);
  const visibleSlices = slices.filter((s) => s.value > 0);
  const total = visibleSlices.reduce((s, x) => s + x.value, 0);
  if (total === 0) {
    return (
      <div className="text-[12.5px] text-[#8C8270] dark:text-zinc-500 px-3 py-6 text-center">
        표시할 데이터가 없습니다.
      </div>
    );
  }

  const R = size / 2 - 6;
  const cx = size / 2;
  const cy = size / 2;
  const innerR = R * 0.62;

  const arcs = visibleSlices.reduce<(Slice & { startA: number; endA: number })[]>((acc, s) => {
    const prev = acc.length ? acc[acc.length - 1].endA / (2 * Math.PI) * total : 0;
    const startA = (prev / total) * 2 * Math.PI;
    const endA = ((prev + s.value) / total) * 2 * Math.PI;
    acc.push({ ...s, startA, endA });
    return acc;
  }, []);

  const layoutClass =
    legendPosition === "bottom"
      ? "relative flex flex-col items-center gap-3"
      : "relative flex flex-col md:flex-row items-center gap-4";

  const showTooltip = (event: MouseEvent<SVGElement>, label: string, value: number) => {
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!rect) return;
    const percent = ((value / total) * 100).toFixed(0);
    const mx = event.clientX - rect.left;
    setTooltip({
      x: mx,
      y: event.clientY - rect.top + 12,
      flip: mx > rect.width * 0.6,
      text: `${label}: ${formatTooltipValue(value, valueKind)} (${percent}%)`,
    });
  };

  return (
    <div className={layoutClass}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {arcs.length === 1 ? (
          <circle
            cx={cx}
            cy={cy}
            r={(R + innerR) / 2}
            fill="none"
            stroke={arcs[0].color}
            strokeWidth={R - innerR}
            onMouseMove={(event) => showTooltip(event, arcs[0].label, arcs[0].value)}
            onMouseLeave={() => setTooltip(null)}
          />
        ) : (
          arcs.map((a, i) => (
            <path
              key={i}
              d={arcPath(cx, cy, R, innerR, a.startA, a.endA)}
              fill={a.color}
              onMouseMove={(event) => showTooltip(event, a.label, a.value)}
              onMouseLeave={() => setTooltip(null)}
            />
          ))
        )}
      </svg>
      {tooltip && (
        <div
          className="pointer-events-none absolute z-20 whitespace-nowrap rounded-md border border-[#D9CBB5] bg-[#2A251D] px-2.5 py-1.5 text-[11.5px] font-semibold text-white shadow-lg dark:border-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
          style={{
            left: tooltip.flip ? tooltip.x - 12 : tooltip.x + 12,
            top: tooltip.y,
            transform: tooltip.flip ? "translateX(-100%)" : undefined,
          }}
        >
          {tooltip.text}
        </div>
      )}
      <ul className="space-y-1 text-[12.5px] min-w-[130px] w-full">
        {arcs.map((a, i) => (
          <li key={i} className="grid grid-cols-[12px_minmax(44px,auto)_1fr] items-center gap-2 text-[#3A342A] dark:text-zinc-300">
            <span
              className="inline-block w-3 h-3 rounded"
              style={{ backgroundColor: a.color }}
            />
            <span className="font-medium whitespace-nowrap">{a.label}</span>
            <span className="text-right whitespace-nowrap text-[#8C8270] dark:text-zinc-500">
              {showLegendValue && (
                <span className="mr-1.5">({formatTooltipValue(a.value, valueKind)})</span>
              )}
              {((a.value / total) * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatTooltipValue(value: number, kind: Props["valueKind"]) {
  if (kind === "money") return `${value.toLocaleString()}원`;
  if (kind === "count") return `${value.toLocaleString()}명`;
  return value.toLocaleString();
}

function arcPath(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startA: number,
  endA: number
) {
  // SVG 0 라디안 = 3시 방향. 12시부터 시작하려면 -π/2 회전.
  const o = -Math.PI / 2;
  const sx = cx + outerR * Math.cos(startA + o);
  const sy = cy + outerR * Math.sin(startA + o);
  const ex = cx + outerR * Math.cos(endA + o);
  const ey = cy + outerR * Math.sin(endA + o);
  const isx = cx + innerR * Math.cos(endA + o);
  const isy = cy + innerR * Math.sin(endA + o);
  const iex = cx + innerR * Math.cos(startA + o);
  const iey = cy + innerR * Math.sin(startA + o);
  const large = endA - startA > Math.PI ? 1 : 0;
  return [
    `M ${sx} ${sy}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${ex} ${ey}`,
    `L ${isx} ${isy}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${iex} ${iey}`,
    "Z",
  ].join(" ");
}
