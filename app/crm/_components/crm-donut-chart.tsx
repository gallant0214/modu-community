"use client";

interface Slice {
  label: string;
  value: number;
  color: string;
}

interface Props {
  slices: Slice[];
  /** 차트 크기 (정사각형 픽셀) */
  size?: number;
}

/**
 * 도넛 차트 — SVG arc 직접 렌더 (PDF 1-1 결제방법 도넛).
 */
export function CrmDonutChart({ slices, size = 180 }: Props) {
  const total = slices.reduce((s, x) => s + x.value, 0);
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

  let cum = 0;
  const arcs = slices.map((s) => {
    const startA = (cum / total) * 2 * Math.PI;
    cum += s.value;
    const endA = (cum / total) * 2 * Math.PI;
    return { ...s, startA, endA };
  });

  return (
    <div className="flex flex-col md:flex-row items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {arcs.map((a, i) => (
          <path
            key={i}
            d={arcPath(cx, cy, R, innerR, a.startA, a.endA)}
            fill={a.color}
          >
            <title>{`${a.label}: ${a.value.toLocaleString()} (${((a.value / total) * 100).toFixed(0)}%)`}</title>
          </path>
        ))}
      </svg>
      <ul className="space-y-1 text-[12.5px] min-w-[110px]">
        {arcs.map((a, i) => (
          <li key={i} className="flex items-center gap-2 text-[#3A342A] dark:text-zinc-300">
            <span
              className="inline-block w-3 h-3 rounded"
              style={{ backgroundColor: a.color }}
            />
            <span className="font-medium">{a.label}</span>
            <span className="text-[#8C8270] dark:text-zinc-500 ml-auto">
              {((a.value / total) * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
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
