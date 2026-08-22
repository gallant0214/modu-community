import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/trainer-app/stats?centerId=
 * 강사 본인(ctx.centerMemberId) 실적 요약 (KST). 센터별 호출 → 앱에서 합산.
 *  - 이번주/이번달 진행·예정 수업, 최근 4주 주당 평균
 *  - 담당 회원 수, 만료 임박 수강권, 미수금 합계
 */
function kstYmd(d?: Date): string {
  const k = new Date((d ?? new Date()).getTime() + 9 * 3600 * 1000);
  return k.toISOString().slice(0, 10);
}
function shiftYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const firstOfMonth = (ymd: string) => `${ymd.slice(0, 7)}-01`;
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
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // 0=월
  const weekStart = shiftYmd(today, -dow);
  const weekEndExcl = shiftYmd(weekStart, 7);
  const rolling28Start = shiftYmd(today, -27);
  const expiringLimit = shiftYmd(today, 14);

  const scopeOr = `trainer_member_id.eq.${me},seller_member_id.eq.${me},co_trainer_ids.cs.{${me}}`;

  const [
    { data: weekRes },
    { data: monthRes },
    { count: rolling28Attended },
    { data: scopedPasses },
    { data: scopedMemberships },
    { data: scopedMembershipsAll },
  ] = await Promise.all([
    supabase
      .from("crm_reservations")
      .select("status")
      .eq("center_id", centerId)
      .eq("trainer_member_id", me)
      .in("status", ["attended", "booked"])
      .gte("starts_at", kstStart(weekStart))
      .lt("starts_at", kstStart(weekEndExcl)),
    supabase
      .from("crm_reservations")
      .select("status")
      .eq("center_id", centerId)
      .eq("trainer_member_id", me)
      .in("status", ["attended", "booked"])
      .gte("starts_at", kstStart(monthStart))
      .lt("starts_at", kstStart(nextMonthStart)),
    supabase
      .from("crm_reservations")
      .select("id", { count: "exact", head: true })
      .eq("center_id", centerId)
      .eq("trainer_member_id", me)
      .eq("status", "attended")
      .gte("starts_at", kstStart(rolling28Start))
      .lt("starts_at", kstStart(todayExcl)),
    supabase
      .from("crm_passes")
      .select("member_id, expires_at, remaining_sessions, total_sessions, outstanding_won")
      .eq("center_id", centerId)
      .eq("status", "valid")
      .or(scopeOr),
    supabase
      .from("crm_memberships")
      .select("outstanding_won")
      .eq("center_id", centerId)
      .eq("seller_member_id", me)
      .in("payment_status", ["unpaid", "partial"]),
    // 만료 회원 계산용: 내가 판매한 회원권(회원별 만료일)
    supabase
      .from("crm_memberships")
      .select("member_id, expires_at")
      .eq("center_id", centerId)
      .eq("status", "valid")
      .eq("seller_member_id", me),
  ]);

  const weekAttended = (weekRes ?? []).filter((r) => r.status === "attended").length;
  const weekBooked = (weekRes ?? []).filter((r) => r.status === "booked").length;
  const monthAttended = (monthRes ?? []).filter((r) => r.status === "attended").length;
  const monthBooked = (monthRes ?? []).filter((r) => r.status === "booked").length;

  const memberSet = new Set<number>();
  let expiringCount = 0;
  let outstandingWon = 0;
  let outstandingCount = 0;
  for (const p of scopedPasses ?? []) {
    if (p.member_id) memberSet.add(p.member_id);
    const expSoon = (p.expires_at ?? "") !== "" && (p.expires_at as string) <= expiringLimit;
    const lowSess = (p.total_sessions ?? 0) > 0 && (p.remaining_sessions ?? 0) <= 2;
    if (expSoon || lowSess) expiringCount += 1;
    if ((p.outstanding_won ?? 0) > 0) {
      outstandingWon += p.outstanding_won ?? 0;
      outstandingCount += 1;
    }
  }
  for (const m of scopedMemberships ?? []) {
    if ((m.outstanding_won ?? 0) > 0) {
      outstandingWon += m.outstanding_won ?? 0;
      outstandingCount += 1;
    }
  }

  // 만료 회원 = 담당(내 스코프) 회원 중 유효(미만료) 상품이 하나도 없고, 만료된 상품이 있는 회원.
  //   재등록해서 새 유효 상품이 생기면 valid=true 가 되어 자동으로 제외(-1)된다.
  const memberExp = new Map<number, { valid: boolean; expired: boolean }>();
  const markExp = (mid: number | null | undefined, exp: string | null | undefined) => {
    if (!mid) return;
    const c = memberExp.get(mid) ?? { valid: false, expired: false };
    const ymd = exp ? String(exp).slice(0, 10) : "";
    if (ymd) {
      if (ymd >= today) c.valid = true; // 무기한(9999) 포함
      else c.expired = true;
    }
    memberExp.set(mid, c);
  };
  for (const p of scopedPasses ?? []) markExp(p.member_id, p.expires_at as string | null);
  for (const m of scopedMembershipsAll ?? []) markExp(m.member_id, (m as { expires_at?: string }).expires_at ?? null);
  let expiredMemberCount = 0;
  for (const [, c] of memberExp) if (c.expired && !c.valid) expiredMemberCount += 1;

  return NextResponse.json({
    weekAttended,
    weekBooked,
    monthAttended,
    monthBooked,
    avgPerWeek: Math.round(((rolling28Attended ?? 0) / 4) * 10) / 10,
    memberCount: memberSet.size,
    expiringCount,
    expiredMemberCount,
    outstandingCount,
    outstandingWon,
  });
}
