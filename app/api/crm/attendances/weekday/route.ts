import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { cached, crmCacheKey } from "@/app/lib/cache";

export const dynamic = "force-dynamic";

/** 평균 산출 기간 — 최근 26주(약 6개월). 데이터가 짧으면 쌓인 만큼만 쓴다. */
const AVG_WEEKS = 26;

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

function dowOf(ymd: string): number {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay();
}

function daysBetween(fromYmd: string, toYmd: string): number {
  return Math.round(
    (new Date(`${toYmd}T00:00:00Z`).getTime() - new Date(`${fromYmd}T00:00:00Z`).getTime()) / 86400000
  );
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** KST 날짜 문자열 (YYYY-MM-DD) */
function todayKst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

type Row = { member_id: number; checked_in_at: string };

/** 기간 내 체크인 조회 (KST 경계) */
async function fetchRange(centerId: number, startYmd: string, endExclYmd: string): Promise<Row[]> {
  const fromUtc = new Date(`${startYmd}T00:00:00+09:00`).toISOString();
  const toUtc = new Date(`${endExclYmd}T00:00:00+09:00`).toISOString();
  return paginateAll<Row>((from, to) =>
    supabase
      .from("crm_attendances")
      .select("member_id, checked_in_at")
      .eq("center_id", centerId)
      .gte("checked_in_at", fromUtc)
      .lt("checked_in_at", toUtc)
      .order("checked_in_at", { ascending: true })
      .range(from, to)
  );
}

/** KST 날짜별 집계 (서버는 UTC 이므로 +9h 후 getUTC* 로 추출) */
function tallyByDate(rows: Row[]) {
  const totals = new Map<string, number>();
  const uniques = new Map<string, Set<number>>();
  for (const a of rows) {
    const kst = new Date(new Date(a.checked_in_at).getTime() + 9 * 3600 * 1000);
    const ymd = kst.toISOString().slice(0, 10);
    totals.set(ymd, (totals.get(ymd) ?? 0) + 1);
    if (!uniques.has(ymd)) uniques.set(ymd, new Set());
    uniques.get(ymd)!.add(a.member_id);
  }
  return { totals, uniques };
}

/**
 * GET /api/crm/attendances/weekday?date=YYYY-MM-DD
 * 선택 날짜가 속한 주(이번주)의 요일별 출석 + 최근 6개월 요일별 평균 (KST, 일요일 시작).
 *
 * 평균 기준:
 *  - 이번주 직전까지의 '완료된' 주만 사용(진행 중인 주가 평균을 끌어내리지 않도록).
 *  - 창 = 최근 26주. 데이터가 더 짧으면 첫 출석일이 속한 주부터(1~2주만 쌓여도 평균이 나옴).
 *  - 완료된 주가 아직 없으면 이번주의 지난 날짜들로 평균을 낸다.
 *  - 요일별 평균 = 그 요일 총 출석 ÷ 그 요일이 창에 등장한 횟수(출석 0인 날도 포함).
 *
 * 응답: { thisWeek: { start, end, days: [{ date, dow, total, unique }] },
 *         average: { from, to, weeks, partial, days: [{ dow, avg, avgUnique }] } }
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const date = url.searchParams.get("date") || todayKst();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date 형식 오류 (YYYY-MM-DD)" }, { status: 400 });
  }

  const thisStart = weekStartKst(date);
  const thisEndExcl = addDays(thisStart, 7);

  try {
    // ── 이번주 (실시간, 캐시 없음) ─────────────────────────────
    const { totals, uniques } = tallyByDate(await fetchRange(ctx.centerId, thisStart, thisEndExcl));
    const thisWeek = {
      start: thisStart,
      end: addDays(thisStart, 6),
      days: Array.from({ length: 7 }, (_, i) => {
        const ymd = addDays(thisStart, i);
        return {
          date: ymd,
          dow: i, // 0=일 … 6=토
          total: totals.get(ymd) ?? 0,
          unique: uniques.get(ymd)?.size ?? 0,
        };
      }),
    };

    // ── 평균 창 계산 ──────────────────────────────────────────
    // 첫 출석일보다 앞으로 갈 필요는 없다(오픈 전 0을 평균에 섞지 않기 위함).
    const { data: firstRow } = await supabase
      .from("crm_attendances")
      .select("checked_in_at")
      .eq("center_id", ctx.centerId)
      .order("checked_in_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const firstYmd = firstRow?.checked_in_at
      ? new Date(new Date(firstRow.checked_in_at).getTime() + 9 * 3600 * 1000)
          .toISOString()
          .slice(0, 10)
      : null;

    let avgStart = addDays(thisStart, -7 * AVG_WEEKS);
    let avgEndExcl = thisStart; // 완료된 주까지만
    if (firstYmd) {
      const firstWeek = weekStartKst(firstYmd);
      if (firstWeek > avgStart) avgStart = firstWeek;
    }
    // 완료된 주가 아직 없으면(오픈 첫 주 등) 이번주 지난 날짜들로라도 평균을 낸다.
    let partial = false;
    if (avgStart >= avgEndExcl) {
      partial = true;
      avgStart = thisStart;
      const tomorrow = addDays(todayKst(), 1);
      avgEndExcl = tomorrow < thisEndExcl ? tomorrow : thisEndExcl;
    }

    let average: {
      from: string;
      to: string;
      weeks: number;
      partial: boolean;
      days: { dow: number; avg: number; avgUnique: number }[];
    };

    if (avgStart >= avgEndExcl) {
      // 출석 기록이 전혀 없는 센터
      average = {
        from: avgStart,
        to: avgStart,
        weeks: 0,
        partial: true,
        days: Array.from({ length: 7 }, (_, dow) => ({ dow, avg: 0, avgUnique: 0 })),
      };
    } else {
      const windowStart = avgStart;
      const windowEndExcl = avgEndExcl;
      // 평균은 하루 단위로는 잘 안 변하고 6개월치를 훑으므로 30분 캐시.
      average = await cached(
        crmCacheKey(ctx, "attendances:weekday-avg", `${windowStart}~${windowEndExcl}`),
        1800,
        async () => {
          const agg = tallyByDate(await fetchRange(ctx.centerId, windowStart, windowEndExcl));
          const sumTotal = Array.from({ length: 7 }, () => 0);
          const sumUnique = Array.from({ length: 7 }, () => 0);
          const occ = Array.from({ length: 7 }, () => 0); // 각 요일이 창에 등장한 횟수(출석 0인 날 포함)
          for (let ymd = windowStart; ymd < windowEndExcl; ymd = addDays(ymd, 1)) {
            const dow = dowOf(ymd);
            occ[dow] += 1;
            sumTotal[dow] += agg.totals.get(ymd) ?? 0;
            sumUnique[dow] += agg.uniques.get(ymd)?.size ?? 0;
          }
          return {
            from: windowStart,
            to: addDays(windowEndExcl, -1),
            weeks: round1(daysBetween(windowStart, windowEndExcl) / 7),
            partial,
            days: Array.from({ length: 7 }, (_, dow) => ({
              dow,
              avg: occ[dow] > 0 ? round1(sumTotal[dow] / occ[dow]) : 0,
              avgUnique: occ[dow] > 0 ? round1(sumUnique[dow] / occ[dow]) : 0,
            })),
          };
        }
      );
    }

    return NextResponse.json({ thisWeek, average });
  } catch (e) {
    return NextResponse.json(
      { error: "조회 실패", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
