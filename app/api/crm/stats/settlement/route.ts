import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { fetchSales } from "@/app/lib/crm-sales";
import { perSessionFee } from "@/app/lib/crm-commission";

export const dynamic = "force-dynamic";

const VAT_RATE = 0.1;

/**
 * GET /api/crm/stats/settlement?ym=YYYY-MM | ?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * 순이익 정산 = 총매출 − 고정지출 − 부가세 − 직원급여 − 추가지출.
 *  - 총매출: 기간 내 발급/결제 (회원권+수강권+대여, 부가세 포함)
 *  - 부가세: vat_included 체크 건의 10% 합
 *  - 고정지출: crm_fixed_expenses 월합 × 기간 개월수
 *  - 직원급여: 재직 직원별 (고정급×개월수 + 수업료(기간 매출×비율))
 *  - 추가지출: crm_additional_expenses 기간 내 월(ym) 합
 *
 * admin 이상만 (재무 정보).
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const ymRaw = url.searchParams.get("ym");
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  const isRange =
    ymd.test(fromRaw || "") && ymd.test(toRaw || "") && (toRaw as string) >= (fromRaw as string);

  const ym = /^\d{4}-\d{2}$/.test(ymRaw || "")
    ? (ymRaw as string)
    : new Date().toISOString().slice(0, 7);

  let startDate: string;
  let nextMonth: string;
  if (isRange) {
    startDate = fromRaw as string;
    const to = new Date(`${toRaw}T00:00:00Z`);
    to.setUTCDate(to.getUTCDate() + 1);
    nextMonth = to.toISOString().slice(0, 10);
  } else {
    const [y, m] = ym.split("-").map(Number);
    startDate = `${ym}-01`;
    nextMonth = new Date(y, m, 1).toISOString().slice(0, 10);
  }

  // 기간에 속한 월 목록 (YYYY-MM). 고정지출·직원 고정급 개월수 + 추가지출 귀속월 매칭.
  const monthsList = listMonths(startDate, nextMonth);
  const monthsInPeriod = Math.max(1, monthsList.length);

  // ── 총매출 ── 실매출 원장 crm_sales 기준 (환불 음수). 부가세는 포함가 가정(÷1.1)
  const periodSales = await fetchSales(ctx.centerId, startDate, nextMonth);
  let totalRevenue = 0;
  for (const s of periodSales) totalRevenue += s.amount_won;
  const totalExVat = Math.round(totalRevenue / (1 + VAT_RATE));
  const vatAmount = totalRevenue - totalExVat;

  // 강사별 수업료 정산 기준 = "진행한 수업 소진분" (판매가 아니라 진행 기준).
  //   진행 수업 = 출석(attended) + 노쇼(noshow) — 둘 다 회차 소진. (직원급여 상세와 동일 기준)
  //   회당 수업료 = perSessionFee(pass) = 부가세제외가 ÷ 총횟수
  //   강사 매출 = Σ(기간 내 진행 예약의 회당 수업료)
  const startUtcS = new Date(`${startDate}T00:00:00+09:00`).toISOString();
  const endUtcS = new Date(`${nextMonth}T00:00:00+09:00`).toISOString();
  const { data: attRes } = await supabase
    .from("crm_reservations")
    .select("pass_id, trainer_member_id")
    .eq("center_id", ctx.centerId)
    .in("status", ["attended", "noshow"])
    .gte("starts_at", startUtcS)
    .lt("starts_at", endUtcS);
  const attPassIds = Array.from(
    new Set((attRes ?? []).map((r) => r.pass_id).filter((v): v is number => !!v))
  );
  const { data: attPasses } = attPassIds.length
    ? await supabase
        .from("crm_passes")
        .select("id, price_won, discount_won, vat_included, total_sessions")
        .eq("center_id", ctx.centerId)
        .in("id", attPassIds)
    : { data: [] };
  const attPassMap = new Map((attPasses ?? []).map((p) => [p.id, p]));
  const revenueByTrainer = new Map<number, number>();
  const sessionCountByTrainer = new Map<number, number>(); // 진행 세션 수 (성과급 조건용)
  for (const r of attRes ?? []) {
    if (!r.trainer_member_id || !r.pass_id) continue;
    const p = attPassMap.get(r.pass_id);
    if (!p) continue;
    revenueByTrainer.set(
      r.trainer_member_id,
      (revenueByTrainer.get(r.trainer_member_id) ?? 0) + perSessionFee(p)
    );
    sessionCountByTrainer.set(
      r.trainer_member_id,
      (sessionCountByTrainer.get(r.trainer_member_id) ?? 0) + 1
    );
  }

  // ── 고정 지출 ───────────────────────────────────────────
  const { data: fixedRows } = await supabase
    .from("crm_fixed_expenses")
    .select("amount_won")
    .eq("center_id", ctx.centerId)
    .eq("status", "active");
  const fixedMonthly = (fixedRows ?? []).reduce((s, x) => s + (x.amount_won ?? 0), 0);
  const fixedTotal = fixedMonthly * monthsInPeriod;

  // ── 직원 급여 ───────────────────────────────────────────
  // 직원급여 상세(payroll)와 동일하게 base + 수업료(commission) + 성과급(bonus) + 현금지급(cash) 합산.
  type Tier = { upTo: number | null; rate: number };
  type Bonus = { metric: string; gte: number; reward_type?: string; bonus_won?: number; bonus_percent?: number };
  const { data: staff } = await supabase
    .from("crm_center_members")
    .select(
      "id, display_name, role, commission_type, commission_rate, commission_tiers, base_salary, commission_bonuses, cash_pay_enabled, cash_pay_won"
    )
    .eq("center_id", ctx.centerId)
    .eq("status", "active")
    .in("role", ["owner", "admin", "manager", "trainer"]);

  const staffBreakdown: {
    id: number;
    name: string;
    base: number;
    commission: number;
    bonus: number;
    cash: number;
    total: number;
  }[] = [];
  let salaryTotal = 0;
  for (const s of staff ?? []) {
    const revenue = revenueByTrainer.get(s.id) ?? 0;
    const sessionCount = sessionCountByTrainer.get(s.id) ?? 0;
    const type = (s.commission_type as string) ?? "fixed";
    const rate = Number(s.commission_rate ?? 0);
    const tiers: Tier[] = Array.isArray(s.commission_tiers) ? (s.commission_tiers as Tier[]) : [];
    let effectiveRate = rate;
    if (type === "tiered") {
      const sorted = [...tiers].sort(
        (a, b) => (a.upTo ?? Number.POSITIVE_INFINITY) - (b.upTo ?? Number.POSITIVE_INFINITY)
      );
      const tier = sorted.find((t) => t.upTo == null || revenue <= t.upTo);
      effectiveRate = tier ? Number(tier.rate) : 0;
    }
    const commission = Math.round((revenue * effectiveRate) / 100);
    const base = Math.max(0, Number(s.base_salary ?? 0)) * monthsInPeriod;

    // 성과급: 지표(revenue/sessions)별 '가장 높은 달성 구간 1개'만 적용(누적 X). payroll 과 동일.
    const bonuses: Bonus[] = Array.isArray(s.commission_bonuses) ? (s.commission_bonuses as Bonus[]) : [];
    const bestByMetric = new Map<string, Bonus>();
    for (const b of bonuses) {
      const actual = b.metric === "sessions" ? sessionCount : revenue;
      if (actual < (Number(b.gte) || 0)) continue;
      const cur = bestByMetric.get(b.metric);
      if (!cur || (Number(b.gte) || 0) > (Number(cur.gte) || 0)) bestByMetric.set(b.metric, b);
    }
    const bonus = [...bestByMetric.values()].reduce((sum, b) => {
      if (b.reward_type === "percent") return sum + Math.round((commission * (Number(b.bonus_percent) || 0)) / 100);
      return sum + Math.max(0, Number(b.bonus_won) || 0);
    }, 0);

    // 현금 지급 (원천징수 대상 아님 — 정산 순이익엔 지출로 포함)
    const cash = s.cash_pay_enabled ? Math.max(0, Number(s.cash_pay_won ?? 0)) : 0;

    const pay = base + commission + bonus + cash;
    if (pay <= 0) continue;
    staffBreakdown.push({ id: s.id, name: s.display_name ?? "", base, commission, bonus, cash, total: pay });
    salaryTotal += pay;
  }
  staffBreakdown.sort((a, b) => b.total - a.total);

  // ── 추가 지출 (기간 내 월) ───────────────────────────────
  const { data: addRows } = await supabase
    .from("crm_additional_expenses")
    .select("amount_won, ym")
    .eq("center_id", ctx.centerId)
    .in("ym", monthsList.length ? monthsList : [ym]);
  const additionalTotal = (addRows ?? []).reduce((s, x) => s + (x.amount_won ?? 0), 0);

  // ── 추가 수입 (기간 내 월) ───────────────────────────────
  const { data: incRows } = await supabase
    .from("crm_additional_incomes")
    .select("amount_won, ym")
    .eq("center_id", ctx.centerId)
    .in("ym", monthsList.length ? monthsList : [ym]);
  const additionalIncomeTotal = (incRows ?? []).reduce((s, x) => s + (x.amount_won ?? 0), 0);

  const netProfit =
    totalRevenue - fixedTotal - vatAmount - salaryTotal - additionalTotal + additionalIncomeTotal;

  return NextResponse.json({
    ym,
    months: monthsList,
    months_in_period: monthsInPeriod,
    total_revenue: totalRevenue,
    total_ex_vat: totalExVat,
    vat_amount: vatAmount,
    fixed_monthly: fixedMonthly,
    fixed_total: fixedTotal,
    salary_total: salaryTotal,
    staff_breakdown: staffBreakdown,
    additional_total: additionalTotal,
    additional_income_total: additionalIncomeTotal,
    net_profit: netProfit,
  });
}

/** startDate(포함) ~ endExclusive(미포함) 사이의 YYYY-MM 목록 */
function listMonths(startDate: string, endExclusive: string): string[] {
  const out: string[] = [];
  const start = new Date(`${startDate.slice(0, 7)}-01T00:00:00Z`);
  const end = new Date(`${endExclusive.slice(0, 10)}T00:00:00Z`);
  const cur = new Date(start);
  for (let guard = 0; guard < 240; guard += 1) {
    if (cur >= end) break;
    out.push(cur.toISOString().slice(0, 7));
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out.length ? out : [startDate.slice(0, 7)];
}
