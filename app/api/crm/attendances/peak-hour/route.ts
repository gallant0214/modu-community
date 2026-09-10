import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

async function paginateAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  chunk = 1000
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += chunk) {
    const res = await build(from, from + chunk - 1);
    if (res.error) throw res.error;
    const rows = res.data ?? [];
    out.push(...rows);
    if (rows.length < chunk) break;
  }
  return out;
}

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * GET /api/crm/attendances/peak-hour?date=YYYY-MM-DD&weeks=8
 * 선택 날짜와 '같은 요일'의 과거 기록만 모아 시간대별 평균 체크인 수를 내고,
 * 평균이 가장 높은 시간대(= 그 요일에 예상되는 피크 시간)를 돌려준다.
 *
 * - 선택 날짜 당일은 제외(아직 진행 중이라 평균을 왜곡) → 순수 과거 같은 요일만 표본.
 * - 표본이 없으면 peak_hour = null.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const date =
    url.searchParams.get("date") ||
    new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date 형식 오류 (YYYY-MM-DD)" }, { status: 400 });
  }
  const weeks = Math.min(26, Math.max(2, Number(url.searchParams.get("weeks")) || 8));

  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0=일
  const startYmd = addDays(date, -7 * weeks);

  const fromUtc = new Date(`${startYmd}T00:00:00+09:00`).toISOString();
  const toUtc = new Date(`${date}T00:00:00+09:00`).toISOString(); // 당일 제외

  let rows: { checked_in_at: string }[];
  try {
    rows = await paginateAll<{ checked_in_at: string }>((from, to) =>
      supabase
        .from("crm_attendances")
        .select("checked_in_at")
        .eq("center_id", ctx.centerId)
        .gte("checked_in_at", fromUtc)
        .lt("checked_in_at", toUtc)
        .order("checked_in_at", { ascending: true })
        .range(from, to)
    );
  } catch (e) {
    return NextResponse.json(
      { error: "조회 실패", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }

  // 같은 요일만 골라 시간대별 합계 + 표본 날짜 수 집계 (KST 변환 후 getUTC*)
  const hourTotals = Array.from({ length: 24 }, () => 0);
  const sampleDates = new Set<string>();
  let total = 0;
  for (const a of rows) {
    const kst = new Date(new Date(a.checked_in_at).getTime() + 9 * 3600 * 1000);
    if (kst.getUTCDay() !== dow) continue;
    hourTotals[kst.getUTCHours()] += 1;
    sampleDates.add(kst.toISOString().slice(0, 10));
    total += 1;
  }

  const sampleDays = sampleDates.size;
  if (sampleDays === 0) {
    return NextResponse.json({
      date,
      dow,
      weeks,
      sample_days: 0,
      total: 0,
      peak_hour: null,
      peak_avg: 0,
      hourly_avg: hourTotals.map(() => 0),
    });
  }

  const hourlyAvg = hourTotals.map((v) => v / sampleDays);
  let peakHour = 0;
  for (let h = 1; h < 24; h++) if (hourTotals[h] > hourTotals[peakHour]) peakHour = h;

  return NextResponse.json({
    date,
    dow,
    weeks,
    sample_days: sampleDays,
    total,
    peak_hour: hourTotals[peakHour] > 0 ? peakHour : null,
    peak_avg: Math.round(hourlyAvg[peakHour] * 10) / 10,
    hourly_avg: hourlyAvg.map((v) => Math.round(v * 10) / 10),
  });
}
