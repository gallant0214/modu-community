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
      .select("id, issue_type, price_won, total_sessions, issued_at, status")
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
    .select("commission_type, commission_rate, commission_tiers, base_salary, employment_type")
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

  for (const p of passes ?? []) {
    breakdown.total += p.price_won ?? 0;
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
  const revenue = breakdown.total;
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
  const totalPay = baseSalary + commissionPayout;

  // 프리랜서(사업소득)는 3.3% 원천징수 후 실지급
  const employmentType = (trainer?.employment_type as string) ?? null;
  const isFreelance = employmentType === "freelance";
  const WITHHOLDING_RATE = 0.033; // 소득세 3% + 지방소득세 0.3%
  const withholdingTax = isFreelance ? Math.round(totalPay * WITHHOLDING_RATE) : 0;
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
      payout: commissionPayout,
    },
    base_salary: baseSalary,
    total_pay: totalPay,
    employment_type: employmentType,
    is_freelance: isFreelance,
    withholding_rate: WITHHOLDING_RATE,
    withholding_tax: withholdingTax,
    net_pay: netPay,
  });
}
