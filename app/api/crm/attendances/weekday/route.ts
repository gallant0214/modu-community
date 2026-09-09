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

/** KST 기준 그 날짜가 속한 주의 시작(일요일) YYYY-MM-DD */
function weekStartKst(ymd: string): string {
  const base = new Date(`${ymd}T00:00:00Z`);
  const dow = base.getUTCDay(); // 0=일
  base.setUTCDate(base.getUTCDate() - dow);
  return base.toISOString().slice(0, 10);
}

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * GET /api/crm/attendances/weekday?date=YYYY-MM-DD
 * 선택 날짜가 속한 주(이번주)와 그 전 주(지난주)의 요일별 출석 집계 (KST, 일요일 시작).
 *
 * 응답: { thisWeek: { start, end, days: [{ date, dow, total, unique }] }, lastWeek: {...} }
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const date = url.searchParams.get("date") || new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date 형식 오류 (YYYY-MM-DD)" }, { status: 400 });
  }

  const thisStart = weekStartKst(date);
  const lastStart = addDays(thisStart, -7);
  const rangeEnd = addDays(thisStart, 7); // 이번주 다음 일요일(미포함 경계)

  // 지난주 일요일 00:00 KST ~ 이번주 다음 일요일 00:00 KST
  const fromUtc = new Date(`${lastStart}T00:00:00+09:00`).toISOString();
  const toUtc = new Date(`${rangeEnd}T00:00:00+09:00`).toISOString();

  let rows: { member_id: number; checked_in_at: string }[];
  try {
    rows = await paginateAll<{ member_id: number; checked_in_at: string }>((from, to) =>
      supabase
        .from("crm_attendances")
        .select("member_id, checked_in_at")
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

  // KST 날짜별 집계 (서버는 UTC 이므로 +9h 후 getUTC* 로 추출)
  const totals = new Map<string, number>();
  const uniques = new Map<string, Set<number>>();
  for (const a of rows) {
    const kst = new Date(new Date(a.checked_in_at).getTime() + 9 * 3600 * 1000);
    const ymd = kst.toISOString().slice(0, 10);
    totals.set(ymd, (totals.get(ymd) ?? 0) + 1);
    if (!uniques.has(ymd)) uniques.set(ymd, new Set());
    uniques.get(ymd)!.add(a.member_id);
  }

  const buildWeek = (start: string) => ({
    start,
    end: addDays(start, 6),
    days: Array.from({ length: 7 }, (_, i) => {
      const ymd = addDays(start, i);
      return {
        date: ymd,
        dow: i, // 0=일 … 6=토
        total: totals.get(ymd) ?? 0,
        unique: uniques.get(ymd)?.size ?? 0,
      };
    }),
  });

  return NextResponse.json({
    thisWeek: buildWeek(thisStart),
    lastWeek: buildWeek(lastStart),
  });
}
