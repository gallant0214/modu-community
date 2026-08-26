import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { cached, crmCacheKey } from "@/app/lib/cache";
import { fetchSales, saleCategory } from "@/app/lib/crm-sales";

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

function classifyLessonKind(label: string | null): "personal" | "group" | "ot" {
  const text = (label ?? "").toLowerCase();
  if (text.includes("group") || text.includes("그룹")) return "group";
  if (text.includes("ot") || text.includes("오티") || text.includes("오리엔테이션")) return "ot";
  return "personal";
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

  // 대시보드 요약은 가장 자주 열고 무거움(회원 전체 스캔) → 30초 캐시.
  const cacheKey = crmCacheKey(ctx, "dashboard:summary", `${period}:${today}`);
  const payload = await cached(cacheKey, 30, async () => {
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
    paginateAll<{
      member_id: number;
      lesson_kind: string | null;
      remaining_sessions: number | null;
      expires_at: string;
      outstanding_won: number | null;
      payment_status: string | null;
    }>((f, t) =>
      supabase
        .from("crm_passes")
        .select("member_id, lesson_kind, remaining_sessions, expires_at, outstanding_won, payment_status")
        .eq("center_id", ctx.centerId)
        .eq("status", "valid")
        .gte("expires_at", today)
        .range(f, t)
    ),
    paginateAll<{
      member_id: number;
      expires_at: string;
      outstanding_won: number | null;
      payment_status: string | null;
    }>((f, t) =>
      supabase
        .from("crm_memberships")
        .select("member_id, expires_at, outstanding_won, payment_status")
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
  const activeExpiryByMember = new Map<number, string>();
  const feedExpiry = (memberId: number, expiresAt: string | null) => {
    if (!expiresAt) return;
    const prev = activeExpiryByMember.get(memberId);
    if (!prev || expiresAt > prev) activeExpiryByMember.set(memberId, expiresAt);
  };
  for (const p of validPasses) feedExpiry(p.member_id, p.expires_at);
  for (const m of validMemberships) feedExpiry(m.member_id, m.expires_at);

  const outstandingByMember = new Map<number, number>();
  let lessonOutstanding = 0;
  let membershipOutstanding = 0;
  const feedOutstanding = (memberId: number, amount: number | null | undefined, paymentStatus: string | null | undefined, kind: "lesson" | "membership") => {
    const won = Math.max(0, Number(amount) || 0);
    if (won <= 0 && paymentStatus !== "unpaid" && paymentStatus !== "partial") return;
    outstandingByMember.set(memberId, (outstandingByMember.get(memberId) ?? 0) + won);
    if (kind === "lesson") lessonOutstanding += won;
    else membershipOutstanding += won;
  };
  for (const p of validPasses) feedOutstanding(p.member_id, p.outstanding_won, p.payment_status, "lesson");
  for (const m of validMemberships) feedOutstanding(m.member_id, m.outstanding_won, m.payment_status, "membership");

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
  let expiring7d = 0;
  let expiring30d = 0;

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

      const activeExpiry = activeExpiryByMember.get(m.id) ?? m.final_expire_at;
      if (activeExpiry) {
        if (activeExpiry <= shiftYmd(today, 7)) expiring7d += 1;
        if (activeExpiry <= shiftYmd(today, 30)) expiring30d += 1;
      }
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

  // 요일별(월~일) 출석 — 이번 주, KST 기준 (매출 그래프처럼 표시)
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0=일 ~ 6=토
  const backToMon = (dow + 6) % 7;
  const weekStart = shiftYmd(today, -backToMon); // 이번 주 월요일
  const weekEndExcl = shiftYmd(weekStart, 7);
  const weekAtt = await paginateAll<{ member_id: number; checked_in_at: string }>((f, t) =>
    supabase
      .from("crm_attendances")
      .select("member_id, checked_in_at")
      .eq("center_id", ctx.centerId)
      .gte("checked_in_at", `${weekStart}T00:00:00+09:00`)
      .lt("checked_in_at", `${weekEndExcl}T00:00:00+09:00`)
      .range(f, t)
  );
  const weeklySets = Array.from({ length: 7 }, () => new Set<number>()); // 월=0 ~ 일=6
  for (const a of weekAtt) {
    const kst = new Date(new Date(a.checked_in_at).getTime() + 9 * 3600 * 1000);
    const wd = (kst.getUTCDay() + 6) % 7;
    weeklySets[wd].add(a.member_id);
  }
  const weekdayLabels = ["월", "화", "수", "목", "금", "토", "일"];
  const weeklyAttendance = weekdayLabels.map((label, i) => ({
    label,
    count: weeklySets[i].size,
  }));

  // 요일별 평균 출석 (이번 주 직전 최근 AVG_WEEKS 주 누적 평균) — 연한 보조선용
  const AVG_WEEKS = 12;
  const avgStart = shiftYmd(weekStart, -7 * AVG_WEEKS);
  const avgAtt = await paginateAll<{ member_id: number; checked_in_at: string }>((f, t) =>
    supabase
      .from("crm_attendances")
      .select("member_id, checked_in_at")
      .eq("center_id", ctx.centerId)
      .gte("checked_in_at", `${avgStart}T00:00:00+09:00`)
      .lt("checked_in_at", `${weekStart}T00:00:00+09:00`)
      .range(f, t)
  );
  // 날짜별 unique 출석 인원 → 요일별 합산 후 주 수로 나눠 평균
  const dayMembers = new Map<string, Set<number>>();
  for (const a of avgAtt) {
    const kst = new Date(new Date(a.checked_in_at).getTime() + 9 * 3600 * 1000);
    const ymd = kst.toISOString().slice(0, 10);
    if (!dayMembers.has(ymd)) dayMembers.set(ymd, new Set());
    dayMembers.get(ymd)!.add(a.member_id);
  }
  const wdSum = Array<number>(7).fill(0);
  for (const [ymd, set] of dayMembers) {
    const wd = (new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7;
    wdSum[wd] += set.size;
  }
  const weeklyAvgAttendance = weekdayLabels.map((label, i) => ({
    label,
    count: Math.round((wdSum[i] / AVG_WEEKS) * 10) / 10,
  }));

  // 매출 통계 (period 내 실제 거래) — 실매출 원장 crm_sales 기준
  // 회원권=멤버십 / 수강권(lesson)=이용권+예약권 / 대여권 / 락커 / 일반(goods). 환불은 음수.
  const salesInPeriod = await fetchSales(ctx.centerId, from, toExcl);
  let membershipRevenue = 0;
  let lessonRevenue = 0;
  let lockerRevenue = 0;
  let goodsRevenue = 0;
  let rentalRevenue = 0;
  const lessonRevenueByGender: GenderRevenue = { male: 0, female: 0 };
  for (const s of salesInPeriod) {
    const cat = saleCategory(s.product_type);
    if (cat === "membership") membershipRevenue += s.amount_won;
    else if (cat === "lesson") {
      lessonRevenue += s.amount_won;
      const gender = genderById.get(s.member_id ?? -1) ?? null;
      if (gender === "M") lessonRevenueByGender.male += s.amount_won;
      else if (gender === "F") lessonRevenueByGender.female += s.amount_won;
    } else if (cat === "rental") rentalRevenue += s.amount_won;
    else if (cat === "locker") lockerRevenue += s.amount_won;
    else goodsRevenue += s.amount_won;
  }

  // 수업 통계 — 그룹/개인/OT
  // period 내 예약 건수 + 신청자 수(unique) + 미진행(시작시각 지났는데 출석 처리 안 된 건: noshow·취소·미출석)
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
    pending: 0,
  };
  const otClasses = { count: 0, applicants: 0, pending: 0 };
  const groupClasses = { count: 0, applicants: 0, pending: 0 };

  // 미진행 = 결제했으나 아직 진행(예약)하지 않은 세션 = 유효 수강권의 잔여 세션 합
  for (const p of validPasses) {
    const pending = Math.max(0, Number(p.remaining_sessions) || 0);
    const kind = classifyLessonKind(p.lesson_kind);
    if (kind === "group") groupClasses.pending += pending;
    else if (kind === "ot") otClasses.pending += pending;
    else personalClasses.pending += pending;
  }

  // 만료된 락커 (배정됐지만 만료일이 지난 락커)
  const { count: expiredLockerCount } = await supabase
    .from("crm_lockers")
    .select("id", { count: "exact", head: true })
    .eq("center_id", ctx.centerId)
    .not("assigned_member_id", "is", null)
    .lt("expires_at", today);

  return {
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
      weekly: weeklyAttendance,
      weeklyAvg: weeklyAvgAttendance,
      weekStart,
    },
    revenue: {
      membership: membershipRevenue,
      lesson: lessonRevenue,
      lessonByGender: lessonRevenueByGender,
      locker: lockerRevenue,
      goods: goodsRevenue,
      rental: rentalRevenue,
      total: membershipRevenue + lessonRevenue + lockerRevenue + goodsRevenue + rentalRevenue,
    },
    active_by_type: {
      new: activeNew,
      renewal: activeRenewal,
      unknown: activeUnknown,
    },
    active_by_product: {
      lesson: activeLesson,
      membership: activeMembershipOnly,
      // 회원권/수강권 유효회원 각각(중복 허용 — 둘 다 보유하면 양쪽 카운트)
      pass_valid: activePassMemberIds.size,
      membership_valid: new Set(validMemberships.map((m) => m.member_id)).size,
    },
    action: {
      expiring7d,
      expiring30d,
      expiredLockers: expiredLockerCount ?? 0,
      outstanding: {
        members: outstandingByMember.size,
        total: lessonOutstanding + membershipOutstanding,
        lesson: lessonOutstanding,
        membership: membershipOutstanding,
      },
    },
    classes: {
      group: groupClasses,
      personal: personalClasses,
      ot: otClasses,
    },
  };
  });

  return NextResponse.json(payload);
}
