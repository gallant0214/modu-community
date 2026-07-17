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

interface GenderRevenue {
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

  // 회원 전체 (성별·POS 스냅샷 필드 포함).
  // crm_passes/memberships 정식 임포트 전이라 final_expire_at·registered_at·registration_type 을
  // 활성/신규/재등록 판정에 사용.
  const members = await paginateAll<{
    id: number;
    gender: Gender;
    created_at: string;
    registered_at: string | null;
    final_expire_at: string | null;
    last_attended_at: string | null;
    registration_type: string | null;
  }>((f, t) =>
    supabase
      .from("crm_members")
      .select("id, gender, created_at, registered_at, final_expire_at, last_attended_at, registration_type")
      .eq("center_id", ctx.centerId)
      .eq("status", "active")
      .range(f, t)
  );

  const genderById = new Map<number, Gender>();
  for (const m of members) genderById.set(m.id, m.gender);

  // 활성 상품 보유 회원 집합 (정식 pass/membership 이 있으면 우선 사용)
  const [validPasses, validMemberships] = await Promise.all([
    paginateAll<{ member_id: number; lesson_kind: string | null; remaining_sessions: number | null }>((f, t) =>
      supabase
        .from("crm_passes")
        .select("member_id, lesson_kind, remaining_sessions")
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
  const activePassMemberIds = new Set<number>(validPasses.map((p) => p.member_id));

  // 회원 통계 집계
  const totalMembers = emptyGC();
  const activeMembers = emptyGC();
  const expiredMembers = emptyGC();
  const newMembers = emptyGC();
  const reregisteredMembers = emptyGC();
  const inactive15dMembers = emptyGC();
  const inactiveCutoff = shiftYmd(today, -15);

  // 유효 회원 중 신규/재등록 구성 (도넛용, period 무관)
  let activeNew = 0;
  let activeRenewal = 0;
  let activeUnknown = 0;
  let activeLesson = 0;
  let activeMembershipOnly = 0;

  for (const m of members) {
    addGender(totalMembers, m.gender);
    // 활성: 정식 데이터 우선 → 없으면 POS 스냅샷 final_expire_at
    const isActive =
      activeMemberIds.has(m.id) ||
      (m.final_expire_at !== null && m.final_expire_at >= today);
    if (isActive) {
      addGender(activeMembers, m.gender);
      const lastAttended = (m.last_attended_at ?? "").slice(0, 10);
      if (!lastAttended || lastAttended <= inactiveCutoff) {
        addGender(inactive15dMembers, m.gender);
      }
      if (m.registration_type === "재등록") activeRenewal += 1;
      else if (m.registration_type === "신규") activeNew += 1;
      else activeUnknown += 1;

      if (activePassMemberIds.has(m.id)) activeLesson += 1;
      else activeMembershipOnly += 1;
    } else addGender(expiredMembers, m.gender);

    // 신규/재등록: POS registered_at 우선(POS 원본 최초 등록일), 없으면 created_at
    const anchorYmd = (m.registered_at ?? m.created_at ?? "").slice(0, 10);
    if (anchorYmd >= from && anchorYmd < toExcl) {
      if (m.registration_type === "재등록") addGender(reregisteredMembers, m.gender);
      else addGender(newMembers, m.gender);
    }
  }

  // 정식 crm_passes 에 있는 renewal 도 재등록에 합산 (POS 스냅샷과 상호보완)
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
  const alreadyCounted = new Set<number>();
  for (const m of members) {
    const anchorYmd = (m.registered_at ?? m.created_at ?? "").slice(0, 10);
    if (m.registration_type === "재등록" && anchorYmd >= from && anchorYmd < toExcl) {
      alreadyCounted.add(m.id);
    }
  }
  for (const p of renewalPasses) {
    if (alreadyCounted.has(p.member_id)) continue;
    addGender(reregisteredMembers, genderById.get(p.member_id) ?? null);
  }

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
    paginateAll<{ member_id: number; price_won: number; total_sessions: number; lesson_kind: string | null }>(
      (f, t) =>
        supabase
          .from("crm_passes")
          .select("member_id, price_won, total_sessions, lesson_kind")
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
  // 레슨권 = 개인 레슨 + 그룹 수업 통합. 그룹 매출 별도 추적은 미구현이라 현재 개인 레슨 합계와 동일
  const lessonRevenue = passesInPeriod.reduce((s, r) => s + (r.price_won ?? 0), 0);
  const lessonRevenueByGender: GenderRevenue = { male: 0, female: 0 };
  for (const p of passesInPeriod) {
    const gender = genderById.get(p.member_id) ?? null;
    if (gender === "M") lessonRevenueByGender.male += p.price_won ?? 0;
    else if (gender === "F") lessonRevenueByGender.female += p.price_won ?? 0;
  }
  const lockerRevenue = 0;
  const goodsRevenue = 0;

  // 수업 통계 — 그룹/개인/OT
  // period 내 예약 건수 + 신청자 수(unique) + 미진행(시작시각 지났는데 출석 처리 안 된 건: noshow·취소·미출석)
  const reservations = await paginateAll<{
    id: number;
    member_id: number;
    status: string;
    starts_at: string;
  }>((f, t) =>
    supabase
      .from("crm_reservations")
      .select("id, member_id, status, starts_at")
      .eq("center_id", ctx.centerId)
      .gte("starts_at", `${from}T00:00:00+09:00`)
      .lt("starts_at", `${toExcl}T00:00:00+09:00`)
      .range(f, t)
  );
  const nowMs = Date.now();
  // 미진행 = 시작시각이 지났는데 출석(attended)되지 않은 수업 (noshow / 취소 / 미출석 booked 모두 포함)
  const notConducted = reservations.filter(
    (r) => r.status !== "attended" && new Date(r.starts_at).getTime() < nowMs
  ).length;
  const personalClasses = {
    count: reservations.length,
    applicants: new Set(reservations.map((r) => r.member_id)).size,
    pending: notConducted,
  };

  // 그룹·OT 는 별도 예약 추적 없음 → 0
  const otClasses = { count: 0, applicants: 0, pending: 0 };
  const groupClasses = { count: 0, applicants: 0, pending: 0 };

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
      inactive15d: inactive15dMembers,
    },
    revenue: {
      membership: membershipRevenue,
      lesson: lessonRevenue,
      lessonByGender: lessonRevenueByGender,
      locker: lockerRevenue,
      goods: goodsRevenue,
      rental: 0,
      total: membershipRevenue + lessonRevenue + lockerRevenue + goodsRevenue,
    },
    active_by_type: {
      new: activeNew,
      renewal: activeRenewal,
      unknown: activeUnknown,
    },
    active_by_product: {
      lesson: activeLesson,
      membership: activeMembershipOnly,
    },
    classes: {
      group: groupClasses,
      personal: personalClasses,
      ot: otClasses,
    },
  });
}
