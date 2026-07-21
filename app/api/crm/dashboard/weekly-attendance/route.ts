import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/dashboard/weekly-attendance
 * 이번 주 / 저번 주 요일별(일~토) 입장 출석 고객 수(중복 제거 회원 수).
 * → { thisWeek, lastWeek } 각 { start, end, total, days: [{date, count}] x7 }
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "manager" });
  if (isCrmError(ctx)) return ctx;

  const nowKst = new Date(Date.now() + 9 * 3600 * 1000);
  const dow = nowKst.getUTCDay(); // 0=일 .. 6=토
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const addDays = (d: Date, n: number) => {
    const x = new Date(d);
    x.setUTCDate(x.getUTCDate() + n);
    return x;
  };
  const thisWeekStart = new Date(Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate() - dow));
  const lastWeekStart = addDays(thisWeekStart, -7);
  const thisWeekEndExcl = addDays(thisWeekStart, 7);

  try {
    const attends: { member_id: number; checked_in_at: string }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from("crm_attendances")
        .select("member_id, checked_in_at")
        .eq("center_id", ctx.centerId)
        .gte("checked_in_at", `${ymd(lastWeekStart)}T00:00:00+09:00`)
        .lt("checked_in_at", `${ymd(thisWeekEndExcl)}T00:00:00+09:00`)
        .range(from, from + 999);
      if (error) throw error;
      const rows = data ?? [];
      attends.push(...(rows as { member_id: number; checked_in_at: string }[]));
      if (rows.length < 1000) break;
    }

    // 요일별 distinct member set (주별)
    const thisSets = Array.from({ length: 7 }, () => new Set<number>());
    const lastSets = Array.from({ length: 7 }, () => new Set<number>());
    for (const a of attends) {
      const kst = new Date(new Date(a.checked_in_at).getTime() + 9 * 3600 * 1000);
      const d = kst.toISOString().slice(0, 10);
      const day = kst.getUTCDay();
      if (d >= ymd(thisWeekStart) && d < ymd(thisWeekEndExcl)) thisSets[day].add(a.member_id);
      else if (d >= ymd(lastWeekStart) && d < ymd(thisWeekStart)) lastSets[day].add(a.member_id);
    }

    const buildWeek = (start: Date, sets: Set<number>[]) => {
      const days = Array.from({ length: 7 }, (_, i) => ({
        date: ymd(addDays(start, i)),
        count: sets[i].size,
      }));
      return {
        start: ymd(start),
        end: ymd(addDays(start, 6)),
        total: days.reduce((s, d) => s + d.count, 0),
        days,
      };
    };

    return NextResponse.json({
      thisWeek: buildWeek(thisWeekStart, thisSets),
      lastWeek: buildWeek(lastWeekStart, lastSets),
    });
  } catch (e) {
    return NextResponse.json(
      { error: "조회 실패", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
