import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/dashboard/summary?period=day|week|month
 * 대시보드 종합 통계 (KST).
 *
 * 회원 통계는 오늘 기준 스냅샷 (활성 상품 유무).
 * 신규가입/재등록/출석/매출/수업은 period 창(day: 오늘, week: 최근 7일, month: 이번달 1일~오늘).
 */
type Gender = "M" | "F" | "N" | null;

interface GenderCount {
  count: number;
  male: number;
  female: number;
}

function emptyGC(): GenderCount {
  return { count: 0, male: 0, female: 0 };
}

function addGender(bucket: GenderCount, g: Gender) {
  bucket.count += 1;
  if (g === "M") bucket.male += 1;
  else if (g === "F") bucket.female += 1;
}

function kstYmd(d?: Date): string {
  const now = d ?? new Date();
  const k = new Date(now.getTime() + 9 * 3600 * 1000);
  return k.toISOString().slice(0, 10);
}
function shiftYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function firstOfMonth(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

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

export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const period = (url.searchParams.get("period") ?? "month") as
    | "day"
    | "week"
    | "month";

  const today = kstYmd();
  let from: string;
  if (period === "day") from = today;
  else if (period === "week") from = shiftYmd(today, -6);
  else from = firstOfMonth(today);
  const toExcl = shiftYmd(today, 1); // to (exclusive)

  // 회원 전체 (성별 스냅샷)
  const members = await paginateAll<{
    id: number;
    gender: Gender;
    created_at: string;
  }>((f, t) =>
    supabase
      .from("crm_members")
      .select("id, gender, created_at")
      .eq("center_id", ctx.centerId)
      .eq("status", "active")
      .range(f, t)
  );

  const genderById = new Map<number, Gender>();
  for (const m of members) genderById.set(m.id, m.gender);

  // 활성 상품 보유 회원 집합
  const [validPasses, validMemberships] = await Promise.all([
    paginateAll<{ member_id: number }>((f, t) =>
      supabase
        .from("crm_passes")
        .select("member_id")
        .eq("center_id", ctx.centerId)
        .eq("status", "valid")
        .gte("expires_at", today)
        .range(f, t)
    ),
    paginateAll<{ member_id: number }>((f, t) =>
      supabase
        .from("crm_memberships")
        .select("member_id")
        .eq("center_id", ctx.centerId)
        .eq("status", "valid")
        .gte("expires_at", today)
        .range(f, t)
    ),
  ]);
  const activeMemberIds = new Set<number>([
    ...validPasses.map((p) => p.member_id),
    ...validMemberships.map((m) => m.member_id),
  ]);

  // 회원 통계 집계
  const totalMembers = emptyGC();
  const activeMembers = emptyGC();
  const expiredMembers = emptyGC();
  const newMembers = emptyGC();

  for (const m of members) {
    addGender(totalMembers, m.gender);
    if (activeMemberIds.has(m.id)) addGender(activeMembers, m.gender);
    else addGender(expiredMembers, m.gender);
    const createdYmd = m.created_at.slice(0, 10);
    if (createdYmd >= from && createdYmd < toExcl) addGender(newMembers, m.gender);
  }

  // 재등록 (period 내 발급된 renewal 유형 수강권 보유자).
  // crm_memberships 는 issue_type 컬럼 없어 수강권 기준만 사용.
  const renewalPasses = await paginateAll<{ member_id: number }>((f, t) =>
    supabase
      .from("crm_passes")
      .select("member_id")
      .eq("center_id", ctx.centerId)
      .eq("issue_type", "renewal")
      .gte("issued_at", from)
      .lt("issued_at", toExcl)
      .range(f, t)
  );
  const reregMemberIds = new Set<number>(renewalPasses.map((p) => p.member_id));
  const reregisteredMembers = emptyGC();
  for (const id of reregMemberIds) addGender(reregisteredMembers, genderById.get(id) ?? null);

  // 출석 통계 (period 내 unique 출석 회원)
  const attends = await paginateAll<{ member_id: number }>((f, t) =>
    supabase
      .from("crm_attendances")
      .select("member_id")
      .eq("center_id", ctx.centerId)
      .gte("checked_in_at", `${from}T00:00:00+09:00`)
      .lt("checked_in_at", `${toExcl}T00:00:00+09:00`)
      .range(f, t)
  );
  const attendedIds = new Set(attends.map((a) => a.member_id));
  const attendedMembers = emptyGC();
  for (const id of attendedIds) addGender(attendedMembers, genderById.get(id) ?? null);

  // 운동 중인 회원 = 오늘 활성 상품 보유
  const workingMembers = activeMembers;

  // 매출 통계 (period 내 발급)
  // 수강권(personal/group PT/OT etc) — crm_passes
  // 회원권 — crm_memberships
  // 락커/운동복/일반 — 아직 매출 추적 미구현 (0)
  const [passesInPeriod, memshipsInPeriod] = await Promise.all([
    paginateAll<{ price_won: number; total_sessions: number; lesson_kind: string | null }>(
      (f, t) =>
        supabase
          .from("crm_passes")
          .select("price_won, total_sessions, lesson_kind")
          .eq("center_id", ctx.centerId)
          .neq("status", "deleted")
          .gte("issued_at", from)
          .lt("issued_at", toExcl)
          .range(f, t)
    ),
    paginateAll<{ price_won: number }>((f, t) =>
      supabase
        .from("crm_memberships")
        .select("price_won")
        .eq("center_id", ctx.centerId)
        .neq("status", "deleted")
        .gte("start_date", from)
        .lt("start_date", toExcl)
        .range(f, t)
    ),
  ]);

  const membershipRevenue = memshipsInPeriod.reduce((s, r) => s + (r.price_won ?? 0), 0);
  const personalRevenue = passesInPeriod.reduce((s, r) => s + (r.price_won ?? 0), 0);
  const groupRevenue = 0; // 추적 미구현 (crm_products.type='group' 사용 시)
  const lockerRevenue = 0;
  const goodsRevenue = 0;

  // 수업 통계 — 그룹/개인/OT
  // period 내 예약 건수 (그룹은 향후 group session 추적 필요) + 신청자 수(unique member_id)
  const reservations = await paginateAll<{ id: number; member_id: number }>((f, t) =>
    supabase
      .from("crm_reservations")
      .select("id, member_id")
      .eq("center_id", ctx.centerId)
      .gte("starts_at", `${from}T00:00:00+09:00`)
      .lt("starts_at", `${toExcl}T00:00:00+09:00`)
      .range(f, t)
  );
  const personalClasses = {
    count: reservations.length,
    applicants: new Set(reservations.map((r) => r.member_id)).size,
  };

  // OT 는 별도 추적 없음 → 0
  const otClasses = { count: 0, applicants: 0 };
  const groupClasses = { count: 0, applicants: 0 };

  return NextResponse.json({
    period,
    range: { from, to: today },
    members: {
      total: totalMembers,
      active: activeMembers,
      expired: expiredMembers,
      newly: newMembers,
      reregistered: reregisteredMembers,
    },
    attendance: {
      attended: attendedMembers,
      working: workingMembers,
    },
    revenue: {
      membership: membershipRevenue,
      personal: personalRevenue,
      group: groupRevenue,
      locker: lockerRevenue,
      goods: goodsRevenue,
      total: membershipRevenue + personalRevenue + groupRevenue + lockerRevenue + goodsRevenue,
    },
    classes: {
      group: groupClasses,
      personal: personalClasses,
      ot: otClasses,
    },
  });
}
