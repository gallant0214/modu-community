import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/payroll/[memberId]?ym=YYYY-MM
 *
 * 강사 이달 지급액 계산:
 *  - 이번달 강사 매출 (crm_passes 발급분, trainer_member_id = memberId)
 *  - 룰 매칭: 강사 override 룰 우선, 없으면 센터 기본 룰
 *  - 룰의 가격 구간(tier)에서 issue_type별 비율/정액 적용
 *
 * 응답:
 *   { passes: [...], rules: [...], breakdown: { new, renewal, trial, service, total },
 *     payout: { new, renewal, trial, total, sessionCount: ... } }
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { memberId } = await params;
  const trainerId = Number(memberId);
  if (!trainerId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const url = new URL(request.url);
  const ymRaw = url.searchParams.get("ym");
  const ym = /^\d{4}-\d{2}$/.test(ymRaw || "")
    ? (ymRaw as string)
    : new Date().toISOString().slice(0, 7);
  const [y, m] = ym.split("-").map(Number);
  const startDate = `${ym}-01`;
  const nextMonth = new Date(y, m, 1).toISOString().slice(0, 10);

  const [{ data: passes }, { data: overrideRules }, { data: defaultRules }] = await Promise.all([
    supabase
      .from("crm_passes")
      .select("id, issue_type, price_won, total_sessions, issued_at, status, vat_included")
      .eq("center_id", ctx.centerId)
      .eq("trainer_member_id", trainerId)
      .neq("status", "deleted")
      .gte("issued_at", startDate)
      .lt("issued_at", nextMonth),
    supabase
      .from("crm_payout_rules")
      .select("mode, tier_index, min_pass_price_won, max_pass_price_won, new_member_value, renewal_value, trial_value")
      .eq("center_id", ctx.centerId)
      .eq("target_member_id", trainerId)
      .order("tier_index", { ascending: true }),
    supabase
      .from("crm_payout_rules")
      .select("mode, tier_index, min_pass_price_won, max_pass_price_won, new_member_value, renewal_value, trial_value")
      .eq("center_id", ctx.centerId)
      .is("target_member_id", null)
      .order("tier_index", { ascending: true }),
  ]);

  const rules = (overrideRules ?? []).length > 0 ? overrideRules! : defaultRules ?? [];

  // 강사 개인 수업료(정산) 설정
  const { data: trainer } = await supabase
    .from("crm_center_members")
    .select("commission_type, commission_rate, commission_tiers, base_salary, employment_type, cash_pay_enabled, cash_pay_won, commission_bonuses")
    .eq("id", trainerId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();

  type Rule = {
    mode: string;
    tier_index: number;
    min_pass_price_won: number;
    max_pass_price_won: number | null;
    new_member_value: number;
    renewal_value: number;
    trial_value: number;
  };

  const findRule = (price: number): Rule | null => {
    for (const r of rules as Rule[]) {
      const max = r.max_pass_price_won ?? Number.POSITIVE_INFINITY;
      if (price >= r.min_pass_price_won && price <= max) return r;
    }
    return null;
  };

  const breakdown = { new: 0, renewal: 0, trial: 0, service: 0, total: 0 };
  const payout = { new: 0, renewal: 0, trial: 0, total: 0 };
  let sessionCount = 0;
  // 커미션 기준 = 부가세 제외 수업료 합. vat_included 면 price/1.1, 아니면 그대로.
  let revenueExVat = 0;

  for (const p of passes ?? []) {
    const price = p.price_won ?? 0;
    breakdown.total += price;
    revenueExVat += (p as { vat_included?: boolean }).vat_included ? Math.round(price / 1.1) : price;
    sessionCount += p.total_sessions ?? 0;
    if (p.issue_type === "new") breakdown.new += p.price_won ?? 0;
    else if (p.issue_type === "renewal") breakdown.renewal += p.price_won ?? 0;
    else if (p.issue_type === "trial") breakdown.trial += p.price_won ?? 0;
    else if (p.issue_type === "service") breakdown.service += p.price_won ?? 0;

    const rule = findRule(p.price_won ?? 0);
    if (!rule) continue;
    const valueFor =
      p.issue_type === "new"
        ? rule.new_member_value
        : p.issue_type === "renewal"
        ? rule.renewal_value
        : p.issue_type === "trial"
        ? rule.trial_value
        : 0;

    const amount =
      rule.mode === "rate"
        ? Math.round(((p.price_won ?? 0) * Number(valueFor)) / 100)
        : Math.round(Number(valueFor) * (p.total_sessions ?? 0)); // 정액제는 세션 수만큼

    payout.total += amount;
    if (p.issue_type === "new") payout.new += amount;
    else if (p.issue_type === "renewal") payout.renewal += amount;
    else if (p.issue_type === "trial") payout.trial += amount;
  }

  // 강사 개인 수업료 설정으로 지급액 계산 (매출 전체에 적용)
  type Tier = { upTo: number | null; rate: number };
  const commissionType = (trainer?.commission_type as string) ?? "fixed";
  const commissionRate = Number(trainer?.commission_rate ?? 0);
  const commissionTiers: Tier[] = Array.isArray(trainer?.commission_tiers)
    ? (trainer!.commission_tiers as Tier[])
    : [];
  // 커미션 % 는 부가세 제외 수업료 기준 (구간 판정·보너스 매출 조건도 동일 기준)
  const revenue = revenueExVat;
  let effectiveRate = commissionRate;
  if (commissionType === "tiered") {
    const sorted = [...commissionTiers].sort(
      (a, b) => (a.upTo ?? Number.POSITIVE_INFINITY) - (b.upTo ?? Number.POSITIVE_INFINITY)
    );
    const tier = sorted.find((t) => t.upTo == null || revenue <= t.upTo);
    effectiveRate = tier ? Number(tier.rate) : 0;
  }
  const commissionPayout = Math.round((revenue * effectiveRate) / 100);
  const baseSalary = Math.max(0, Number(trainer?.base_salary ?? 0));

  // 커미션(성과급): 조건 달성 시 보너스 가산.
  // metric: revenue=월매출 / sessions=이번달 진행세션. reward_type: won=정액 / percent=수업료의 %
  type Bonus = {
    metric: string;
    gte: number;
    reward_type?: string;
    bonus_won?: number;
    bonus_percent?: number;
  };
  const bonuses: Bonus[] = Array.isArray(trainer?.commission_bonuses)
    ? (trainer!.commission_bonuses as Bonus[])
    : [];
  const achievedBonuses = bonuses.filter((b) => {
    const actual = b.metric === "sessions" ? sessionCount : revenue;
    return actual >= (Number(b.gte) || 0);
  });
  const bonusPayout = achievedBonuses.reduce((s, b) => {
    if (b.reward_type === "percent") {
      return s + Math.round((commissionPayout * (Number(b.bonus_percent) || 0)) / 100);
    }
    return s + Math.max(0, Number(b.bonus_won) || 0);
  }, 0);

  // 현금 지급 (3.3% 원천징수 대상 아님)
  const cashEnabled = !!trainer?.cash_pay_enabled;
  const cashPay = cashEnabled ? Math.max(0, Number(trainer?.cash_pay_won ?? 0)) : 0;

  const totalPay = baseSalary + commissionPayout + bonusPayout + cashPay;

  // 프리랜서(사업소득)는 3.3% 원천징수 후 실지급. 단 현금 지급분은 원천징수 제외
  const employmentType = (trainer?.employment_type as string) ?? null;
  const isFreelance = employmentType === "freelance";
  const WITHHOLDING_RATE = 0.033; // 소득세 3% + 지방소득세 0.3%
  const taxableForWithholding = Math.max(0, totalPay - cashPay);
  const withholdingTax = isFreelance ? Math.round(taxableForWithholding * WITHHOLDING_RATE) : 0;
  const netPay = totalPay - withholdingTax;

  return NextResponse.json({
    ym,
    passes: passes ?? [],
    rules,
    breakdown,
    payout,
    sessionCount,
    has_override: (overrideRules ?? []).length > 0,
    commission: {
      type: commissionType,
      rate: commissionRate,
      tiers: commissionTiers,
      effective_rate: effectiveRate,
      base: revenue, // 부가세 제외 수업료 기준
      payout: commissionPayout,
    },
    base_salary: baseSalary,
    bonuses,
    achieved_bonuses: achievedBonuses,
    bonus_payout: bonusPayout,
    cash_pay_enabled: cashEnabled,
    cash_pay: cashPay,
    total_pay: totalPay,
    employment_type: employmentType,
    is_freelance: isFreelance,
    withholding_rate: WITHHOLDING_RATE,
    withholding_tax: withholdingTax,
    net_pay: netPay,
  });
}
