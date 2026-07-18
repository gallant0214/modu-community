import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

async function paginateAll<T>(
  build: (from: number, to: number) => { then: (fn: (r: unknown) => void) => unknown },
  chunk = 1000
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += chunk) {
    const to = from + chunk - 1;
    const res = (await build(from, to)) as { data: T[] | null; error: unknown };
    if (res.error) throw res.error;
    const rows = res.data ?? [];
    out.push(...rows);
    if (rows.length < chunk) break;
  }
  return out;
}

/**
 * GET /api/crm/attendances/monthly?month=YYYY-MM
 * 그 달의 날짜별 출입 인원 수 (KST). 달력 표시용.
 * days[YYYY-MM-DD] = { total: 총 출석 횟수, unique: 출입 인원(사람) 수 }
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const month = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month 형식 오류 (YYYY-MM)" }, { status: 400 });
  }

  const startUtc = new Date(`${month}-01T00:00:00+09:00`);
  const endUtc = new Date(startUtc);
  endUtc.setUTCMonth(endUtc.getUTCMonth() + 1);

  let rows: { member_id: number; checked_in_at: string }[];
  try {
    rows = await paginateAll<{ member_id: number; checked_in_at: string }>((from, to) =>
      supabase
        .from("crm_attendances")
        .select("member_id, checked_in_at")
        .eq("center_id", ctx.centerId)
        .gte("checked_in_at", startUtc.toISOString())
        .lt("checked_in_at", endUtc.toISOString())
        .order("checked_in_at", { ascending: true })
        .range(from, to)
    );
  } catch (e) {
    return NextResponse.json(
      { error: "조회 실패", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }

  // KST 날짜별로 집계
  const totals = new Map<string, number>();
  const uniques = new Map<string, Set<number>>();
  for (const a of rows) {
    const kst = new Date(new Date(a.checked_in_at).getTime() + 9 * 3600 * 1000);
    const ymd = kst.toISOString().slice(0, 10);
    totals.set(ymd, (totals.get(ymd) ?? 0) + 1);
    if (!uniques.has(ymd)) uniques.set(ymd, new Set());
    uniques.get(ymd)!.add(a.member_id);
  }

  const days: Record<string, { total: number; unique: number }> = {};
  for (const [ymd, total] of totals) {
    days[ymd] = { total, unique: uniques.get(ymd)?.size ?? 0 };
  }

  return NextResponse.json({ month, days });
}
