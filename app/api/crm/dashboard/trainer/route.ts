import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import {
  perSessionFee,
  effectiveCommissionRate,
  commissionPayout,
  type CommissionConfig,
} from "@/app/lib/crm-commission";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/dashboard/trainer
 * 개인 트레이너 대시보드 집계 (KST). 본인(ctx.centerMemberId) 스코프.
 *  - 확정/예상 수업료: 내가 담당 강사(trainer_member_id=나)인 예약 기준.
 *  - 회원 목록(만료/미수금/진행률): 담당 OR 추가강사 OR 판매(seller)가 나인 수강권 기준.
 */

// ── KST 헬퍼 (dashboard/summary 패턴 재사용) ──
function kstYmd(d?: Date): string {
  const k = new Date((d ?? new Date()).getTime() + 9 * 3600 * 1000);
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
const kstStart = (ymd: string) => `${ymd}T00:00:00+09:00`;

export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  const me = ctx.centerMemberId;
  const centerId = ctx.centerId;

  const today = kstYmd();
  const todayExcl = shiftYmd(today, 1);
  const monthStart = firstOfMonth(today);
  const nextMonthStart = firstOfMonth(shiftYmd(monthStart, 32));
  // 이번 주(월~일)
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // 0=월
  const weekStart = shiftYmd(today, -dow);
  const weekEndExcl = shiftYmd(weekStart, 7);
  const rolling28Start = shiftYmd(today, -27); // 최근 28일(오늘 포함) 평균용

  // ── 병렬 1차 조회 ──
  const scopeOr = `trainer_member_id.eq.${me},seller_member_id.eq.${me},co_trainer_ids.cs.{${me}}`;
  const [
    { data: meRow },
    { data: monthRes },
    { data: weekRes },
    { data: scopedPasses },
    { data: recentRes },
    { data: futureRes },
    { data: scopedMemberships },
    { count: rolling28Attended },
  ] = await Promise.all([
    // 내 커미션 설정
    supabase
      .from("crm_center_members")
      .select("commission_type, commission_rate, commission_tiers")
      .eq("id", me)
      .maybeSingle(),
    // 이번달 내 담당 예약 (확정/예상 수업료)
    supabase
      .from("crm_reservations")
      .select("id, pass_id, member_id, status, starts_at")
      .eq("center_id", centerId)
      .eq("trainer_member_id", me)
      .in("status", ["attended", "booked"])
      .gte("starts_at", kstStart(monthStart))
      .lt("starts_at", kstStart(nextMonthStart)),
    // 이번주 내 담당 예약 (오늘/주간 일정)
    supabase
      .from("crm_reservations")
      .select("id, pass_id, member_id, status, starts_at, ends_at")
      .eq("center_id", centerId)
      .eq("trainer_member_id", me)
      .not("status", "in", "(cancelled,requested,rejected)")
      .gte("starts_at", kstStart(weekStart))
      .lt("starts_at", kstStart(weekEndExcl))
      .order("starts_at", { ascending: true }),
    // 내 범위 유효 수강권 (만료/미수금/진행률)
    supabase
      .from("crm_passes")
      .select(
        "id, member_id, lesson_kind, expires_at, remaining_sessions, total_sessions, price_won, vat_included, payment_status, outstanding_won, status"
      )
      .eq("center_id", centerId)
      .eq("status", "valid")
      .or(scopeOr),
    // 최근 완료 수업 (내 담당 attended)
    supabase
      .from("crm_reservations")
      .select("id, pass_id, member_id, attended_at, starts_at")
      .eq("center_id", centerId)
      .eq("trainer_member_id", me)
      .eq("status", "attended")
      .order("attended_at", { ascending: false, nullsFirst: false })
      .limit(20),
    // 다음 예약(미래 booked) — 회원별 최소 시각
    supabase
      .from("crm_reservations")
      .select("member_id, starts_at")
      .eq("center_id", centerId)
      .eq("trainer_member_id", me)
      .eq("status", "booked")
      .gte("starts_at", kstStart(today))
      .order("starts_at", { ascending: true }),
    // 내가 판매한 회원권 중 미수금
    supabase
      .from("crm_memberships")
      .select("id, member_id, plan_name, payment_status, outstanding_won")
      .eq("center_id", centerId)
      .eq("seller_member_id", me)
      .in("payment_status", ["unpaid", "partial"]),
    // 최근 28일 진행(attended) 수업 수 — 주당/일당 평균용
    supabase
      .from("crm_reservations")
      .select("id", { count: "exact", head: true })
      .eq("center_id", centerId)
      .eq("trainer_member_id", me)
      .eq("status", "attended")
      .gte("starts_at", kstStart(rolling28Start))
      .lt("starts_at", kstStart(todayExcl)),
  ]);

  // ── pass 사전 (회당 수업료 산출용): month + recent + scoped 의 pass 합집합 ──
  const passIds = new Set<number>();
  (monthRes ?? []).forEach((r) => r.pass_id && passIds.add(r.pass_id));
  (recentRes ?? []).forEach((r) => r.pass_id && passIds.add(r.pass_id));
  const { data: feePasses } = passIds.size
    ? await supabase
        .from("crm_passes")
        .select("id, price_won, vat_included, total_sessions, payment_status")
        .in("id", Array.from(passIds))
    : { data: [] as { id: number; price_won: number; vat_included: boolean; total_sessions: number; payment_status: string }[] };
  const passMap = new Map((feePasses ?? []).map((p) => [p.id, p]));

  // ── 회원 이름/최근출석 사전 ──
  const memberIds = new Set<number>();
  [monthRes, weekRes, scopedPasses, recentRes, scopedMemberships].forEach((arr) =>
    (arr ?? []).forEach((r: { member_id?: number | null }) => r.member_id && memberIds.add(r.member_id))
  );
  const { data: members } = memberIds.size
    ? await supabase
        .from("crm_members")
        .select("id, name, last_attended_at, registered_at, registration_type, created_at")
        .in("id", Array.from(memberIds))
    : {
        data: [] as {
          id: number;
          name: string;
          last_attended_at: string | null;
          registered_at: string | null;
          registration_type: string | null;
          created_at: string | null;
        }[],
      };
  const memberMap = new Map((members ?? []).map((m) => [m.id, m]));
  const nameOf = (id: number | null | undefined) =>
    (id != null && memberMap.get(id)?.name) || "회원";

  // ── 확정/예상 수업료 ──
  let confirmedRevenue = 0;
  let expectedRevenue = 0;
  let attendedCount = 0;
  let bookedCount = 0;
  for (const r of monthRes ?? []) {
    const p = r.pass_id ? passMap.get(r.pass_id) : null;
    const fee = p ? perSessionFee(p) : 0;
    if (r.status === "attended") {
      confirmedRevenue += fee;
      attendedCount += 1;
    } else if (r.status === "booked") {
      bookedCount += 1;
    }
    expectedRevenue += fee; // attended + booked
  }
  const cfg: CommissionConfig = meRow ?? {};
  const hasCommission =
    (String(cfg.commission_type) === "tiered" &&
      Array.isArray(cfg.commission_tiers) &&
      cfg.commission_tiers.length > 0) ||
    Number(cfg.commission_rate ?? 0) > 0;
  const effRate = hasCommission ? effectiveCommissionRate(cfg, expectedRevenue) : 0;
  const month = {
    ym: today.slice(0, 7),
    confirmedRevenue,
    expectedRevenue,
    attendedCount,
    bookedCount,
    hasCommission,
    effectiveRate: effRate,
    confirmedPayout: hasCommission ? commissionPayout(cfg, confirmedRevenue) : null,
    expectedPayout: hasCommission ? commissionPayout(cfg, expectedRevenue) : null,
  };

  // ── 오늘 / 이번주 일정 ──
  type Sess = {
    reservationId: number;
    startsAt: string;
    endsAt: string | null;
    memberName: string;
    status: string;
  };
  const toSess = (r: {
    id: number;
    starts_at: string;
    ends_at?: string | null;
    member_id: number | null;
    status: string;
  }): Sess => ({
    reservationId: r.id,
    startsAt: r.starts_at,
    endsAt: r.ends_at ?? null,
    memberName: nameOf(r.member_id),
    status: r.status,
  });
  const todaySessions = (weekRes ?? [])
    .filter((r) => kstYmd(new Date(r.starts_at)) === today)
    .map(toSess);
  const todayRemaining = todaySessions.filter((s) => s.status === "booked").length;

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = shiftYmd(weekStart, i);
    const sessions = (weekRes ?? [])
      .filter((r) => kstYmd(new Date(r.starts_at)) === date)
      .map(toSess);
    return { date, dow: i, count: sessions.length, sessions };
  });

  // ── 만료 예정 / 잔여 2회 이하 ──
  const expiryLimit = shiftYmd(today, 14);
  const expiring = (scopedPasses ?? [])
    .filter(
      (p) =>
        (p.expires_at && p.expires_at !== "9999-12-31" && p.expires_at <= expiryLimit) ||
        (p.remaining_sessions ?? 0) <= 2
    )
    .map((p) => ({
      memberId: p.member_id,
      memberName: nameOf(p.member_id),
      lessonKind: p.lesson_kind,
      expiresAt: p.expires_at,
      remainingSessions: p.remaining_sessions,
      reason:
        (p.remaining_sessions ?? 0) <= 2 ? ("low_sessions" as const) : ("expiring" as const),
    }))
    .sort((a, b) => (a.expiresAt ?? "").localeCompare(b.expiresAt ?? ""));

  // ── 미수금 / 결제 대기 ──
  const outstanding = [
    ...(scopedPasses ?? [])
      .filter(
        (p) =>
          ["unpaid", "partial"].includes(String(p.payment_status)) &&
          (p.outstanding_won ?? 0) > 0
      )
      .map((p) => ({
        memberName: nameOf(p.member_id),
        product: p.lesson_kind || "수강권",
        outstandingWon: p.outstanding_won ?? 0,
        paymentStatus: p.payment_status,
      })),
    ...(scopedMemberships ?? [])
      .filter((m) => (m.outstanding_won ?? 0) > 0)
      .map((m) => ({
        memberName: nameOf(m.member_id),
        product: m.plan_name || "회원권",
        outstandingWon: m.outstanding_won ?? 0,
        paymentStatus: m.payment_status,
      })),
  ].sort((a, b) => b.outstandingWon - a.outstandingWon);

  // ── 회원별 진행률 ──
  const nextByMember = new Map<number, string>();
  for (const r of futureRes ?? []) {
    if (r.member_id != null && !nextByMember.has(r.member_id)) {
      nextByMember.set(r.member_id, r.starts_at);
    }
  }
  const memberProgress = (scopedPasses ?? [])
    .map((p) => {
      const total = p.total_sessions ?? 0;
      const remaining = p.remaining_sessions ?? 0;
      return {
        memberName: nameOf(p.member_id),
        lessonKind: p.lesson_kind,
        remaining,
        total,
        done: Math.max(0, total - remaining),
        lastAttendedAt: (p.member_id != null && memberMap.get(p.member_id)?.last_attended_at) || null,
        nextReservationAt: (p.member_id != null && nextByMember.get(p.member_id)) || null,
      };
    })
    .sort((a, b) => a.remaining - b.remaining);

  // ── 최근 완료 수업 ──
  const recentCompleted = (recentRes ?? []).map((r) => {
    const p = r.pass_id ? passMap.get(r.pass_id) : null;
    return {
      attendedAt: r.attended_at ?? r.starts_at,
      memberName: nameOf(r.member_id),
      perSessionFee: p ? perSessionFee(p) : 0,
      paymentStatus: p?.payment_status ?? null,
    };
  });

  // ── 운영 지표 ──
  // 유효회원 = 내 범위 유효 수강권 보유 distinct 회원
  const activeMemberIds = new Set<number>();
  (scopedPasses ?? []).forEach((p) => p.member_id && activeMemberIds.add(p.member_id));
  const activeMembers = activeMemberIds.size;

  // 2주(15일) 넘게 미진행 = 유효회원 중 마지막 출석이 15일 이전이거나 기록 없음
  const dormantLimit = shiftYmd(today, -15); // 이 날짜 이하(=15일 이상 지남)면 dormant
  let dormant2w = 0;
  for (const mid of activeMemberIds) {
    const la = memberMap.get(mid)?.last_attended_at;
    if (!la || la <= dormantLimit) dormant2w += 1;
  }

  // 세션 수
  const attendedThisMonth = attendedCount;
  const bookedThisMonth = bookedCount;
  const weekRemaining = (weekRes ?? []).filter((r) => r.status === "booked").length;
  const rolling = rolling28Attended ?? 0;
  const avgPerWeek = Math.round((rolling / 4) * 10) / 10;
  const avgPerDay = Math.round((rolling / 28) * 10) / 10;

  // 이번달 신규/재등록 (내 범위 회원 중 registered_at 이번달)
  let newThisMonth = 0;
  let renewalThisMonth = 0;
  for (const m of members ?? []) {
    // 등록일 우선, 없으면 생성일 (회원관리 페이지 signup 필터와 동일 기준)
    const reg = m.registered_at ?? (m.created_at ? m.created_at.slice(0, 10) : null);
    if (!reg || reg < monthStart || reg >= nextMonthStart) continue;
    if (m.registration_type === "재등록") renewalThisMonth += 1;
    else if (m.registration_type === "신규") newThisMonth += 1;
  }
  const regTotal = newThisMonth + renewalThisMonth;
  const ratioNew = regTotal > 0 ? Math.round((newThisMonth / regTotal) * 100) : 0;
  const ratioRenewal = regTotal > 0 ? 100 - ratioNew : 0;

  return NextResponse.json({
    month,
    metrics: {
      activeMembers,
      dormant2w,
      attendedThisMonth,
      bookedThisMonth,
      weekRemaining,
      avgPerWeek,
      avgPerDay,
      newThisMonth,
      renewalThisMonth,
      ratioNew,
      ratioRenewal,
    },
    today: { remaining: todayRemaining, sessions: todaySessions },
    week: { days: weekDays },
    expiring,
    outstanding,
    memberProgress,
    recentCompleted,
  });
}
