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
 * GET /api/crm/trainer-app/settlement?centerId=
 * 강사 본인(ctx.centerMemberId)의 이번달 정산 요약 (KST).
 *  - 이번달 총 예약 / 진행(attended) / 남은(booked) 수업 수
 *  - 진행분 예상 월급(confirmedPayout) / 전체 예상 월급(expectedPayout)
 * 로직은 대시보드(trainer)와 동일한 커미션 계산(crm-commission) 사용.
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
  // ?ym=YYYY-MM 으로 특정 월 조회 (기본: 이번달)
  const ymParam = new URL(request.url).searchParams.get("ym");
  const ym = ymParam && /^\d{4}-\d{2}$/.test(ymParam) ? ymParam : today.slice(0, 7);
  const monthStart = `${ym}-01`;
  const nextMonthStart = firstOfMonth(shiftYmd(monthStart, 32));

  const [{ data: meRow }, { data: monthRes }] = await Promise.all([
    supabase
      .from("crm_center_members")
      .select("commission_type, commission_rate, commission_tiers")
      .eq("id", me)
      .maybeSingle(),
    supabase
      .from("crm_reservations")
      .select("id, pass_id, status, starts_at")
      .eq("center_id", centerId)
      .eq("trainer_member_id", me)
      .in("status", ["attended", "booked"])
      .gte("starts_at", kstStart(monthStart))
      .lt("starts_at", kstStart(nextMonthStart)),
  ]);

  // 회당 수업료 산출용 pass 사전
  const passIds = Array.from(new Set((monthRes ?? []).map((r) => r.pass_id).filter(Boolean) as number[]));
  const { data: feePasses } = passIds.length
    ? await supabase
        .from("crm_passes")
        .select("id, price_won, vat_included, total_sessions")
        .in("id", passIds)
    : { data: [] as { id: number; price_won: number; vat_included: boolean; total_sessions: number }[] };
  const passMap = new Map((feePasses ?? []).map((p) => [p.id, p]));

  let confirmedRevenue = 0; // 진행(attended) 매출(부가세 제외)
  let expectedRevenue = 0; // 진행 + 예정(booked) 매출
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
    expectedRevenue += fee;
  }

  const cfg: CommissionConfig = meRow ?? {};
  const hasCommission =
    (String(cfg.commission_type) === "tiered" &&
      Array.isArray(cfg.commission_tiers) &&
      cfg.commission_tiers.length > 0) ||
    Number(cfg.commission_rate ?? 0) > 0;

  return NextResponse.json({
    ym,
    isCurrentMonth: ym === today.slice(0, 7),
    totalReservations: attendedCount + bookedCount,
    attendedCount,
    bookedCount,
    hasCommission,
    effectiveRate: hasCommission ? effectiveCommissionRate(cfg, expectedRevenue) : 0,
    confirmedRevenue,
    expectedRevenue,
    confirmedPayout: hasCommission ? commissionPayout(cfg, confirmedRevenue) : null,
    expectedPayout: hasCommission ? commissionPayout(cfg, expectedRevenue) : null,
  });
}
