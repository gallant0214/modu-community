"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";

interface DayPoint {
  date: string;
  count: number;
}
interface Week {
  start: string;
  end: string;
  total: number;
  days: DayPoint[];
}

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const W = 700;
const H = 240;
const PAD_L = 34;
const PAD_R = 14;
const PAD_T = 16;
const PAD_B = 26;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

const LAST_COLOR = "#B8AC93";
const THIS_COLOR = "#E8863B";

function niceMax(v: number): number {
  if (v <= 10) return 10;
  const step = v <= 40 ? 10 : v <= 100 ? 20 : v <= 200 ? 50 : 100;
  return Math.ceil(v / step) * step;
}

export function WeeklyAttendanceChart() {
  const { getIdToken } = useAuth();
  const [thisWeek, setThisWeek] = useState<Week | null>(null);
  const [lastWeek, setLastWeek] = useState<Week | null>(null);
  const [loading, setLoading] = useState(true);
  const [hover, setHover] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch("/api/crm/dashboard/weekly-attendance", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) return;
      const d = await res.json();
      setThisWeek(d.thisWeek ?? null);
      setLastWeek(d.lastWeek ?? null);
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <div className="text-[12.5px] text-[#8C8270] py-10 text-center">불러오는 중…</div>;
  }
  if (!thisWeek || !lastWeek) {
    return <div className="text-[12.5px] text-[#8C8270] py-10 text-center">데이터가 없어요.</div>;
  }

  const maxVal = Math.max(
    1,
    ...thisWeek.days.map((d) => d.count),
    ...lastWeek.days.map((d) => d.count)
  );
  const yMax = niceMax(maxVal);
  const x = (i: number) => PAD_L + (PLOT_W * i) / 6;
  const y = (v: number) => PAD_T + PLOT_H * (1 - v / yMax);

  const linePath = (days: DayPoint[]) =>
    days.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.count).toFixed(1)}`).join(" ");
  const areaPath = (days: DayPoint[]) =>
    `${linePath(days)} L${x(6).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;

  const gridVals = [0, 0.25, 0.5, 0.75, 1].map((r) => Math.round(yMax * r));

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * W;
    const idx = Math.round((vx - PAD_L) / (PLOT_W / 6));
    setHover(Math.max(0, Math.min(6, idx)));
  };

  return (
    <div>
      {/* 범례 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-[12.5px]">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: LAST_COLOR }} />
          <span className="text-[#6B5D47] dark:text-zinc-300">저번 주</span>
          <b className="text-[#2A251D] dark:text-zinc-100">{lastWeek.total}명</b>
          <span className="text-[#A89B80] text-[11.5px]">{lastWeek.start} ~ {lastWeek.end}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: THIS_COLOR }} />
          <span className="text-[#6B5D47] dark:text-zinc-300">이번 주</span>
          <b className="text-[#2A251D] dark:text-zinc-100">{thisWeek.total}명</b>
          <span className="text-[#A89B80] text-[11.5px]">{thisWeek.start} ~ {thisWeek.end}</span>
        </span>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="thisWeekFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={THIS_COLOR} stopOpacity="0.28" />
              <stop offset="100%" stopColor={THIS_COLOR} stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* 그리드 + Y라벨 */}
          {gridVals.map((gv, i) => {
            const gy = y(gv);
            return (
              <g key={i}>
                <line
                  x1={PAD_L}
                  y1={gy}
                  x2={W - PAD_R}
                  y2={gy}
                  stroke="#E8E0D0"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  className="dark:opacity-30"
                />
                <text x={PAD_L - 6} y={gy + 3} textAnchor="end" fontSize={10} fill="#A89B80">
                  {gv}
                </text>
              </g>
            );
          })}

          {/* 호버 세로 가이드 */}
          {hover !== null && (
            <line x1={x(hover)} y1={PAD_T} x2={x(hover)} y2={PAD_T + PLOT_H} stroke="#C9BCA0" strokeWidth={1} />
          )}

          {/* 이번 주 영역 + 라인 */}
          <path d={areaPath(thisWeek.days)} fill="url(#thisWeekFill)" />
          <path d={linePath(lastWeek.days)} fill="none" stroke={LAST_COLOR} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          <path d={linePath(thisWeek.days)} fill="none" stroke={THIS_COLOR} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

          {/* 점 */}
          {lastWeek.days.map((d, i) => (
            <circle key={`l${i}`} cx={x(i)} cy={y(d.count)} r={hover === i ? 4 : 0} fill={LAST_COLOR} />
          ))}
          {thisWeek.days.map((d, i) => (
            <circle key={`t${i}`} cx={x(i)} cy={y(d.count)} r={hover === i ? 5 : 0} fill={THIS_COLOR} />
          ))}

          {/* X 라벨 */}
          {DAY_LABELS.map((lab, i) => (
            <text
              key={i}
              x={x(i)}
              y={H - 6}
              textAnchor="middle"
              fontSize={11}
              fill={hover === i ? "#3A342A" : "#8C8270"}
              fontWeight={hover === i ? 700 : 400}
            >
              {lab}
            </text>
          ))}
        </svg>

        {/* 툴팁 */}
        {hover !== null && (
          <div
            className="absolute pointer-events-none -translate-x-1/2 -translate-y-full bg-white dark:bg-zinc-800 border border-[#E8E0D0] dark:border-zinc-700 rounded-lg shadow-lg px-3 py-2 text-[11.5px] whitespace-nowrap z-10"
            style={{ left: `${(x(hover) / W) * 100}%`, top: "38%" }}
          >
            <div className="font-bold text-[#2A251D] dark:text-zinc-100 mb-1">{DAY_LABELS[hover]}</div>
            <div className="flex items-center gap-1.5 text-[#6B5D47] dark:text-zinc-300">
              <span className="w-2 h-2 rounded-full" style={{ background: LAST_COLOR }} />
              저번 주 <span className="text-[#A89B80]">{lastWeek.days[hover].date}</span>
              <b className="ml-1 text-[#2A251D] dark:text-zinc-100">{lastWeek.days[hover].count}명</b>
            </div>
            <div className="flex items-center gap-1.5 text-[#6B5D47] dark:text-zinc-300 mt-0.5">
              <span className="w-2 h-2 rounded-full" style={{ background: THIS_COLOR }} />
              이번 주 <span className="text-[#A89B80]">{thisWeek.days[hover].date}</span>
              <b className="ml-1 text-[#2A251D] dark:text-zinc-100">{thisWeek.days[hover].count}명</b>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
