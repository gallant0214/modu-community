"use client";

import { useState } from "react";
import type { MouseEvent } from "react";

interface Point {
  label: string;
  value: number;
}

interface Props {
  points: Point[];
  /** y축 단위 (예: "만원"). 축에 표시되지는 않고 툴팁에만 들어감. */
  unit?: string;
  /** 표시할 라인 색상. 기본 올리브. */
  color?: string;
  /** 차트 픽셀 높이 */
  height?: number;
  /** 연하게 겹쳐 그릴 보조선(예: 평균). points 와 인덱스로 정렬됨. */
  overlay?: Point[];
  /** 보조선 색상. 기본 회색. */
  overlayColor?: string;
  /** 보조선 범례 라벨 (예: "평균"). */
  overlayLabel?: string;
  /** 본선 범례 라벨 (overlay 있을 때만 표시). 기본 "이번 주". */
  primaryLabel?: string;
  /** true = 보조선을 본선과 동일한 실선+점으로(색만 다름). false(기본) = 연한 점선. */
  overlaySolid?: boolean;
  /** 본선 각 점의 날짜/기간 텍스트 (툴팁에 표시, 예: "2026-07"). points 와 인덱스 정렬. */
  dates?: string[];
  /** 보조선 각 점의 날짜/기간 텍스트 (툴팁에 표시, 예: "2025-07"). */
  overlayDates?: string[];
}

interface TooltipRow {
  color: string;
  label: string;
  date?: string;
  value: string;
}

/**
 * 단일 라인 + 점 차트. 외부 라이브러리 없이 SVG 로 직접 렌더.
 * ESM 호환 안 좋은 recharts 등을 피하기 위해 직접 구현 ([[feedback-vercel-ssr-esm]]).
 */
export function CrmLineChart({
  points,
  unit = "",
  color = "#6B7B3A",
  height = 220,
  overlay,
  overlayColor = "#9AA0A6",
  overlayLabel,
  primaryLabel = "이번 주",
  overlaySolid = false,
  dates,
  overlayDates,
}: Props) {
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    flip: boolean;
    title: string;
    rows: TooltipRow[];
  } | null>(null);
  const W = 600;
  const H = height;
  const padL = unit === "원" ? 72 : 40;
  const padR = 12;
  const padT = 16;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  if (points.length === 0) {
    return (
      <div className="text-[12.5px] text-[#8C8270] dark:text-zinc-500 px-3 py-6 text-center">
        표시할 데이터가 없습니다.
      </div>
    );
  }

  const overlayPts = overlay ?? [];
  const max = Math.max(...points.map((p) => p.value), ...overlayPts.map((p) => p.value), 1);
  const min = 0;
  const xStep = points.length > 1 ? innerW / (points.length - 1) : innerW / 2;
  const y = (v: number) => padT + innerH - ((v - min) / (max - min || 1)) * innerH;
  const xAt = (i: number) => padL + (points.length > 1 ? i * xStep : innerW / 2);

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(" ");

  const overlayPath = overlayPts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(" ");

  // 4개 그리드 라인
  const gridYs = [0, 0.25, 0.5, 0.75, 1].map((t) => padT + innerH * (1 - t));
  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t));

  // 본선/보조선 어느 점에 올려도 두 시리즈를 함께 보여주는 카드 툴팁
  const buildTip = (event: MouseEvent<SVGCircleElement>, i: number) => {
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!rect) return;
    const p = points[i];
    const ov = overlayPts[i];
    const rows: TooltipRow[] = [
      {
        color,
        label: primaryLabel,
        date: dates?.[i],
        value: formatTooltipValue(p.value, unit),
      },
    ];
    if (ov !== undefined && overlayLabel) {
      rows.push({
        color: overlayColor,
        label: overlayLabel,
        date: overlayDates?.[i],
        value: formatTooltipValue(ov.value, unit),
      });
    }
    const mx = event.clientX - rect.left;
    setTooltip({
      x: mx,
      y: event.clientY - rect.top + 12,
      flip: mx > rect.width * 0.6, // 우측이면 커서 왼쪽으로
      title: p.label,
      rows,
    });
  };

  return (
    <div className="relative w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full text-[#A89B80] dark:text-zinc-500"
        preserveAspectRatio="none"
        style={{ minWidth: 320 }}
      >
        {/* 그리드 */}
        {gridYs.map((gy, i) => (
          <g key={i}>
            <line
              x1={padL}
              x2={W - padR}
              y1={gy}
              y2={gy}
              stroke="currentColor"
              strokeOpacity={0.18}
            />
            <text
              x={padL - 4}
              y={gy + 3}
              textAnchor="end"
              fontSize={10}
              fill="currentColor"
            >
              {formatAxisValue(gridValues[i], unit)}
            </text>
          </g>
        ))}

        {/* x축 라벨 */}
        {points.map((p, i) => (
          <text
            key={i}
            x={padL + (points.length > 1 ? i * xStep : innerW / 2)}
            y={H - padB + 16}
            textAnchor="middle"
            fontSize={10}
            fill="currentColor"
          >
            {p.label}
          </text>
        ))}

        {/* 보조선(예: 작년 동월) */}
        {overlayPath &&
          (overlaySolid ? (
            <path d={overlayPath} fill="none" stroke={overlayColor} strokeWidth={2} />
          ) : (
            <path
              d={overlayPath}
              fill="none"
              stroke={overlayColor}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              strokeOpacity={0.55}
            />
          ))}

        {/* 보조선 점 + 호버 툴팁 — 실선 모드일 때만 (본선 아래에 먼저 그림) */}
        {overlaySolid &&
          overlayPts.map((p, i) => {
            const x = xAt(i);
            const py = y(p.value);
            return (
              <g key={`ov${i}`}>
                <circle cx={x} cy={py} r={3.5} fill={overlayColor} />
                <circle
                  cx={x}
                  cy={py}
                  r={11}
                  fill="transparent"
                  onMouseMove={(event) => buildTip(event, i)}
                  onMouseLeave={() => setTooltip(null)}
                />
              </g>
            );
          })}

        {/* 라인 */}
        <path d={path} fill="none" stroke={color} strokeWidth={2} />

        {/* 점 + 호버 툴팁 */}
        {points.map((p, i) => {
          const x = padL + (points.length > 1 ? i * xStep : innerW / 2);
          const py = y(p.value);
          return (
            <g key={i}>
              <circle cx={x} cy={py} r={3.5} fill={color} />
              <circle
                cx={x}
                cy={py}
                r={11}
                fill="transparent"
                onMouseMove={(event) => buildTip(event, i)}
                onMouseLeave={() => setTooltip(null)}
              />
            </g>
          );
        })}
      </svg>
      {overlayLabel && overlayPts.length > 0 && (
        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-[#8C8270] dark:text-zinc-500">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-4 h-0.5 rounded" style={{ background: color }} />
            {primaryLabel}
          </span>
          <span className="inline-flex items-center gap-1">
            {overlaySolid ? (
              <span className="inline-block w-4 h-0.5 rounded" style={{ background: overlayColor }} />
            ) : (
              <span className="inline-block w-4 h-0 border-t-2 border-dashed" style={{ borderColor: overlayColor }} />
            )}
            {overlayLabel}
          </span>
        </div>
      )}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-20 whitespace-nowrap rounded-lg border border-[#D9CBB5]/40 bg-[#2A251D]/95 px-3 py-2 text-white shadow-xl dark:border-zinc-700 dark:bg-zinc-100/95 dark:text-zinc-900"
          style={{
            left: tooltip.flip ? tooltip.x - 12 : tooltip.x + 12,
            top: tooltip.y,
            transform: tooltip.flip ? "translateX(-100%)" : undefined,
          }}
        >
          <div className="text-[13px] font-bold mb-1">{tooltip.title}</div>
          <div className="space-y-0.5">
            {tooltip.rows.map((r, idx) => (
              <div key={idx} className="flex items-center gap-2 text-[11.5px]">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.color }} />
                <span className="opacity-90">{r.label}</span>
                {r.date && <span className="opacity-60">{r.date}</span>}
                <span className="ml-auto pl-3 font-bold">{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatAxisValue(n: number, unit: string) {
  if (unit === "원") return formatWonAxis(n);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return n.toString();
}

function formatWonAxis(n: number) {
  // 1단위(원 전체)로 표시 — '1.1만' 같은 만 단위 소수 표기 제거
  return Math.round(n).toLocaleString();
}

function formatTooltipValue(value: number, unit: string) {
  if (unit === "원") return `${value.toLocaleString()}원`;
  if (unit) return `${value.toLocaleString()}${unit}`;
  return value.toLocaleString();
}

