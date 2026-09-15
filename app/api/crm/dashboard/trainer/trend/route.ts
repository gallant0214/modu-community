import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { perSessionFee } from "@/app/lib/crm-commission";
import {
  loadPayHistory,
  payConfigFromMember,
  monthlyCommission,
  hasCommissionConfig,
  type SessionFee,
} from "@/app/lib/crm-pay-history";

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
      // 진행 = 출석 + 노쇼 (급여/정산과 동일 기준)
      .in("status", ["attended", "noshow"])
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

  // 월별 진행 수업 — 수업일에 유효한 설정 요율을 쓰기 위해 시각 보존
  const sessionsByMonth = new Map<string, SessionFee[]>();
  for (const r of attended ?? []) {
    const ym = kstYmd(new Date(r.starts_at)).slice(0, 7);
    const p = r.pass_id ? passMap.get(r.pass_id) : null;
    const list = sessionsByMonth.get(ym) ?? [];
    list.push({ at: r.starts_at, fee: p ? perSessionFee(p) : 0 });
    sessionsByMonth.set(ym, list);
  }

  // 🚨 수업료 설정은 이력 기준 — 설정을 바꿔도 지난 달 월급 추이가 바뀌지 않게
  const payVersions = (await loadPayHistory(centerId, me ? [me] : [])).get(me ?? 0);
  const payFallback = payConfigFromMember(meRow);
  const hasCommission =
    hasCommissionConfig(payFallback) || (payVersions ?? []).some((v) => hasCommissionConfig(v));
  const salaryOf = (ym: string): number => {
    const mc = monthlyCommission(sessionsByMonth.get(ym) ?? [], payVersions, payFallback, ym);
    // 그 달에 수업료 설정이 없으면 매출 그대로 (기존 동작 유지)
    return mc.hasCommission ? mc.payout : mc.revenue;
  };

  const months = months12.map((ym) => ({
    ym,
    salary: salaryOf(ym),
    salaryPrev: salaryOf(monthShift(ym, -12)),
  }));

  return NextResponse.json({ months, hasCommission });
}
