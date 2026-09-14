"use client";

import { useState } from "react";

/**
 * 상권분석용 막대 차트 2종.
 *
 * 마크 규격(데이터 시각화 가이드):
 *  - 막대는 최대 24px, 데이터 끝만 4px 라운드(기준선 쪽은 각짐)
 *  - 격자/축은 표면에서 한 단계만 뜬 회색, 1px 실선(점선 금지)
 *  - 단일 계열이라 범례 없음 — 제목이 무엇을 그린 건지 말해준다
 *  - 값 라벨은 선택적으로, 나머지는 축과 툴팁이 맡는다
 * 색: 라이트 #5c8a1e / 다크 #6ea023 (팔레트 검사 전 항목 통과)
 */

const BAR = "fill-[#5c8a1e] dark:fill-[#6ea023]";
const BAR_DIM = "fill-[#5c8a1e]/25 dark:fill-[#6ea023]/25";

export interface Datum {
  label: string;
  count: number;
}

/** 가로 막대 — 카테고리 이름이 길 때(업종·동·규모). 값은 막대 끝에 직접 표기. */
export function HBar({ data, unit = "곳", emptyText = "데이터가 없어요" }: {
  data: Datum[];
  unit?: string;
  emptyText?: string;
}) {
  if (data.length === 0) {
    return <div className="py-8 text-center text-[12.5px] text-[#8C8270] dark:text-zinc-500">{emptyText}</div>;
  }
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <ul className="space-y-1.5">
      {data.map((d) => (
        <li key={d.label} className="flex items-center gap-2.5">
          <span className="w-[104px] shrink-0 text-[11.5px] text-[#6B5D47] dark:text-zinc-400 truncate text-right">
            {d.label}
          </span>
          <span className="flex-1 min-w-0 h-[18px] relative">
            <svg width="100%" height="18" className="overflow-visible" role="img"
                 aria-label={`${d.label} ${d.count}${unit}`}>
              <rect x="0" y="3" width={`${Math.max(1.5, (d.count / max) * 100)}%`} height="12"
                    rx="4" className={BAR} />
            </svg>
          </span>
          <span className="w-[42px] shrink-0 text-[12px] font-semibold tabular-nums text-[#2A251D] dark:text-zinc-100">
            {d.count.toLocaleString()}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * 세로 막대 — 순서가 있는 구간(거리대·연도).
 * 값은 최댓값만 직접 표기하고 나머지는 호버 툴팁이 맡는다.
 */
export function VBar({ data, unit = "곳", height = 168 }: {
  data: Datum[];
  unit?: string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (data.length === 0) {
    return <div className="py-8 text-center text-[12.5px] text-[#8C8270] dark:text-zinc-500">데이터가 없어요</div>;
  }

  const W = 100; // % 좌표계
  const max = Math.max(1, ...data.map((d) => d.count));
  const maxIdx = data.findIndex((d) => d.count === max);
  const padT = 18;
  const padB = 22;
  const innerH = height - padT - padB;
  const slot = W / data.length;
  const barW = Math.min(24, slot * 0.52); // 슬롯을 채우지 않고 여백을 남긴다

  // 격자선 3칸
  const ticks = [0, 0.5, 1].map((t) => ({ v: Math.round(max * t), y: padT + innerH * (1 - t) }));

  return (
    <div className="relative">
      <svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none"
           className="overflow-visible block">
        {/* 격자 — 표면에서 한 단계만 뜬 회색, 1px 실선 */}
        {ticks.map((t) => (
          <line key={t.y} x1="0" x2={W} y1={t.y} y2={t.y}
                className="stroke-[#E8E0D0] dark:stroke-zinc-800" strokeWidth="1"
                vectorEffect="non-scaling-stroke" />
        ))}
        {data.map((d, i) => {
          const h = max > 0 ? (d.count / max) * innerH : 0;
          const x = slot * i + (slot - barW) / 2;
          const y = padT + innerH - h;
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {/* 히트 영역은 막대보다 넓게 */}
              <rect x={slot * i} y={0} width={slot} height={height} fill="transparent" />
              <rect x={x} y={y} width={barW} height={Math.max(h, d.count > 0 ? 2 : 0)}
                    rx="4" className={hover === null || hover === i ? BAR : BAR_DIM} />
            </g>
          );
        })}
      </svg>

      {/* 라벨·값은 SVG 밖에서(viewBox 스케일에 글자가 늘어나지 않게) */}
      <div className="absolute inset-x-0 flex" style={{ top: 0, height: padT }}>
        {data.map((d, i) => (
          <div key={d.label} className="flex-1 text-center text-[11px] font-semibold tabular-nums
                                        text-[#2A251D] dark:text-zinc-100">
            {hover === i || (hover === null && i === maxIdx) ? `${d.count}${unit}` : ""}
          </div>
        ))}
      </div>
      <div className="absolute inset-x-0 bottom-0 flex" style={{ height: padB }}>
        {data.map((d) => (
          <div key={d.label} className="flex-1 text-center text-[10.5px] text-[#8C8270] dark:text-zinc-500 truncate">
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/** 차트 카드 껍데기 — 제목이 곧 범례 역할을 한다(단일 계열이라 범례 박스 없음) */
export function ChartCard({ title, hint, children }: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 px-4 py-3.5">
      <h3 className="text-[13px] font-bold text-[#2A251D] dark:text-zinc-100">{title}</h3>
      {hint && <p className="mt-0.5 mb-2.5 text-[11px] text-[#A89B80] dark:text-zinc-500">{hint}</p>}
      <div className={hint ? "" : "mt-2.5"}>{children}</div>
    </section>
  );
}
