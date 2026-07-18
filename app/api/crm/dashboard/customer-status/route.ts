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

const AGE_BUCKETS = ["10대 이하", "20대", "30대", "40대", "50대", "60대 이상", "미등록"] as const;

function ageBucket(birth: string | null): (typeof AGE_BUCKETS)[number] {
  if (!birth || birth.length < 4) return "미등록";
  const year = Number(birth.slice(0, 4));
  if (!year) return "미등록";
  const kstYear = new Date(Date.now() + 9 * 3600 * 1000).getUTCFullYear();
  const age = kstYear - year;
  if (age < 20) return "10대 이하";
  if (age < 30) return "20대";
  if (age < 40) return "30대";
  if (age < 50) return "40대";
  if (age < 60) return "50대";
  return "60대 이상";
}

/**
 * GET /api/crm/dashboard/customer-status
 * 최근 12개월 고객 현황 시계열 (띠그래프용).
 * - validCount: 그 달에 유효 이용권(회원권+수강권)을 보유한 고객 수
 * - gender / age: 유효 고객의 성별·연령대 구성
 * - newMembership / newPass: 그 달 신규 발급 고객 수
 * - visited: 그 달 방문(출석) 고객 수
 * - churn: 마지막 이용권 만료가 그 달인(이탈) 고객 수
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "manager" });
  if (isCrmError(ctx)) return ctx;

  // 최근 12개월 (KST 기준). months[i] = { ym, start, endExcl }
  const nowKst = new Date(Date.now() + 9 * 3600 * 1000);
  const months: { ym: string; start: string; endExcl: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth() - i, 1));
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    months.push({
      ym: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      start: d.toISOString().slice(0, 10),
      endExcl: next.toISOString().slice(0, 10),
    });
  }
  const windowStart = months[0].start;
  const windowEndExcl = months[11].endExcl;
  const todayYmd = nowKst.toISOString().slice(0, 10);

  try {
    // 회원 성별·생년 (전체) — 유효 고객 구성 산출용
    const members = await paginateAll<{ id: number; gender: string | null; birth: string | null }>(
      (f, t) =>
        supabase
          .from("crm_members")
          .select("id, gender, birth")
          .eq("center_id", ctx.centerId)
          .neq("status", "deleted")
          .range(f, t)
    );
    const memberMap = new Map(members.map((m) => [m.id, m]));

    // 회원권 + 수강권 (윈도우와 겹치는 것 전부)
    const [memberships, passes] = await Promise.all([
      paginateAll<{ member_id: number; start_date: string | null; expires_at: string | null }>((f, t) =>
        supabase
          .from("crm_memberships")
          .select("member_id, start_date, expires_at")
          .eq("center_id", ctx.centerId)
          .neq("status", "deleted")
          .range(f, t)
      ),
      paginateAll<{ member_id: number; start_date: string | null; issued_at: string | null; expires_at: string | null }>((f, t) =>
        supabase
          .from("crm_passes")
          .select("member_id, start_date, issued_at, expires_at")
          .eq("center_id", ctx.centerId)
          .neq("status", "deleted")
          .range(f, t)
      ),
    ]);

    // 방문(출석) — 윈도우 내
    const attends = await paginateAll<{ member_id: number; checked_in_at: string }>((f, t) =>
      supabase
        .from("crm_attendances")
        .select("member_id, checked_in_at")
        .eq("center_id", ctx.centerId)
        .gte("checked_in_at", `${windowStart}T00:00:00+09:00`)
        .lt("checked_in_at", `${windowEndExcl}T00:00:00+09:00`)
        .range(f, t)
    );

    // 월별 유효 고객 집합
    const validSets = months.map(() => new Set<number>());
    const addValid = (memberId: number, start: string | null, expires: string | null) => {
      const s = start ?? windowStart;
      if (!expires) return;
      for (let i = 0; i < months.length; i++) {
        // 겹침: start < monthEnd && expires >= monthStart
        if (s < months[i].endExcl && expires >= months[i].start) validSets[i].add(memberId);
      }
    };
    for (const m of memberships) addValid(m.member_id, m.start_date, m.expires_at);
    for (const p of passes) addValid(p.member_id, p.start_date ?? p.issued_at, p.expires_at);

    // 월별 신규 발급 고객 (start_date 또는 issued_at 이 그 달)
    const inMonth = (ymd: string | null): number => {
      if (!ymd) return -1;
      const d = ymd.slice(0, 10);
      return months.findIndex((mm) => d >= mm.start && d < mm.endExcl);
    };
    const newMembershipSets = months.map(() => new Set<number>());
    const newPassSets = months.map(() => new Set<number>());
    for (const m of memberships) {
      const idx = inMonth(m.start_date);
      if (idx >= 0) newMembershipSets[idx].add(m.member_id);
    }
    for (const p of passes) {
      const idx = inMonth(p.start_date ?? p.issued_at);
      if (idx >= 0) newPassSets[idx].add(p.member_id);
    }

    // 월별 방문 고객
    const visitedSets = months.map(() => new Set<number>());
    for (const a of attends) {
      const kst = new Date(new Date(a.checked_in_at).getTime() + 9 * 3600 * 1000);
      const ymd = kst.toISOString().slice(0, 10);
      const idx = months.findIndex((mm) => ymd >= mm.start && ymd < mm.endExcl);
      if (idx >= 0) visitedSets[idx].add(a.member_id);
    }

    // 이탈: 회원별 마지막 만료월 (그 이후 커버리지 없음 & 이미 만료)
    const lastExpiry = new Map<number, string>();
    const feed = (memberId: number, expires: string | null) => {
      if (!expires) return;
      const prev = lastExpiry.get(memberId);
      if (!prev || expires > prev) lastExpiry.set(memberId, expires);
    };
    for (const m of memberships) feed(m.member_id, m.expires_at);
    for (const p of passes) feed(p.member_id, p.expires_at);
    const churn = months.map(() => 0);
    for (const [, exp] of lastExpiry) {
      const d = exp.slice(0, 10);
      if (d >= todayYmd) continue; // 아직 유효 → 이탈 아님
      const idx = months.findIndex((mm) => d >= mm.start && d < mm.endExcl);
      if (idx >= 0) churn[idx] += 1;
    }

    // 월별 성별·연령 구성
    const gender = { male: months.map(() => 0), female: months.map(() => 0), none: months.map(() => 0) };
    const age = Object.fromEntries(AGE_BUCKETS.map((b) => [b, months.map(() => 0)])) as Record<string, number[]>;
    validSets.forEach((set, i) => {
      for (const id of set) {
        const mem = memberMap.get(id);
        const g = mem?.gender;
        if (g === "M") gender.male[i] += 1;
        else if (g === "F") gender.female[i] += 1;
        else gender.none[i] += 1;
        age[ageBucket(mem?.birth ?? null)][i] += 1;
      }
    });

    return NextResponse.json({
      months: months.map((m) => m.ym),
      validCount: validSets.map((s) => s.size),
      gender,
      ageBuckets: AGE_BUCKETS,
      age,
      newMembership: newMembershipSets.map((s) => s.size),
      newPass: newPassSets.map((s) => s.size),
      visited: visitedSets.map((s) => s.size),
      churn,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "조회 실패", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
