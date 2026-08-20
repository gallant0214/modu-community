import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import {
  perSessionFee,
  effectiveCommissionRate,
  type CommissionConfig,
} from "@/app/lib/crm-commission";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/dashboard/trainer/trend
 * 개인 월급(정산액) 12개월 추이 (올해 + 작년 동월). KST.
 * 월급 = 그 달 내가 담당(attended)한 예약의 회당 수업료 합 × 커미션 요율. 커미션 없으면 매출 그대로.
 */
function kstYmd(d?: Date): string {
  const k = new Date((d ?? new Date()).getTime() + 9 * 3600 * 1000);
  return k.toISOString().slice(0, 10);
}
/** "YYYY-MM" + n개월 */
function monthShift(ym: string, n: number): string {
  const y = Number(ym.slice(0, 4));
  const mo = Number(ym.slice(5, 7)) - 1 + n;
  const ny = y + Math.floor(mo / 12);
  const nm = ((mo % 12) + 12) % 12;
  return `${ny}-${String(nm + 1).padStart(2, "0")}`;
}
const kstMonthStart = (ym: string) => `${ym}-01T00:00:00+09:00`;

export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  const me = ctx.centerMemberId;
  const centerId = ctx.centerId;

  const curMonth = kstYmd().slice(0, 7);
  // 표시할 12개월 (11개월 전 ~ 이번달)
  const months12 = Array.from({ length: 12 }, (_, i) => monthShift(curMonth, i - 11));
  // 데이터 필요 범위: 가장 이른 표시월의 작년 동월(= 이번달 -23개월) 부터
  const earliest = monthShift(curMonth, -23);
  const endExcl = monthShift(curMonth, 1);

  const [{ data: meRow }, { data: attended }] = await Promise.all([
    supabase
      .from("crm_center_members")
      .select("commission_type, commission_rate, commission_tiers")
      .eq("id", me)
      .maybeSingle(),
    supabase
      .from("crm_reservations")
      .select("pass_id, starts_at")
      .eq("center_id", centerId)
      .eq("trainer_member_id", me)
      .eq("status", "attended")
      .gte("starts_at", kstMonthStart(earliest))
      .lt("starts_at", kstMonthStart(endExcl)),
  ]);

  // 회당 수업료용 pass 사전
  const passIds = Array.from(
    new Set((attended ?? []).map((r) => r.pass_id).filter((v): v is number => !!v))
  );
  const { data: passes } = passIds.length
    ? await supabase
        .from("crm_passes")
        .select("id, price_won, discount_won, vat_included, total_sessions")
        .in("id", passIds)
    : { data: [] as { id: number; price_won: number; discount_won: number; vat_included: boolean; total_sessions: number }[] };
  const passMap = new Map((passes ?? []).map((p) => [p.id, p]));

  // 월별 매출(회당 수업료 합)
  const revByMonth = new Map<string, number>();
  for (const r of attended ?? []) {
    const ym = kstYmd(new Date(r.starts_at)).slice(0, 7);
    const p = r.pass_id ? passMap.get(r.pass_id) : null;
    revByMonth.set(ym, (revByMonth.get(ym) ?? 0) + (p ? perSessionFee(p) : 0));
  }

  const cfg: CommissionConfig = meRow ?? {};
  const hasCommission =
    (String(cfg.commission_type) === "tiered" &&
      Array.isArray(cfg.commission_tiers) &&
      cfg.commission_tiers.length > 0) ||
    Number(cfg.commission_rate ?? 0) > 0;
  const salaryOf = (ym: string): number => {
    const rev = revByMonth.get(ym) ?? 0;
    if (!hasCommission) return rev;
    return Math.round((rev * effectiveCommissionRate(cfg, rev)) / 100);
  };

  const months = months12.map((ym) => ({
    ym,
    salary: salaryOf(ym),
    salaryPrev: salaryOf(monthShift(ym, -12)),
  }));

  return NextResponse.json({ months, hasCommission });
}
