import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { perSessionFee } from "@/app/lib/crm-commission";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/payroll/[memberId]?ym=YYYY-MM  또는 ?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * 강사 지급액 계산:
 *  - 기간 내 강사 매출 (crm_passes 발급분, trainer_member_id = memberId)
 *  - 룰 매칭: 강사 override 룰 우선, 없으면 센터 기본 룰
 *  - 룰의 가격 구간(tier)에서 issue_type별 비율/정액 적용
 *
 * 접근 권한:
 *  - admin (owner/admin/manager 등) 은 모든 강사 조회 가능
 *  - trainer 는 본인(memberId === ctx.centerMemberId) 만 조회 가능
 *
 * 응답:
 *   { passes: [...], rules: [...], breakdown: { new, renewal, trial, service, total },
 *     payout: { new, renewal, trial, total, sessionCount: ... } }
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { memberId } = await params;
  const trainerId = Number(memberId);
  if (!trainerId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const isAdmin = ctx.accessLevel === "admin" || ctx.role === "owner" || ctx.role === "admin";
  const isSelf = trainerId === (ctx.centerMemberId ?? -1);
  if (!isAdmin && !isSelf) {
    return NextResponse.json({ error: "본인 수업료만 조회할 수 있습니다" }, { status: 403 });
  }

  const url = new URL(request.url);
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  const ymRaw = url.searchParams.get("ym");

  const isDate = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  let startDate: string;
  let nextMonth: string;
  let ym: string;

  if (isDate(fromRaw) && isDate(toRaw)) {
    startDate = fromRaw!;
    const to = new Date(`${toRaw}T00:00:00Z`);
    to.setUTCDate(to.getUTCDate() + 1);
    nextMonth = to.toISOString().slice(0, 10);
    ym = startDate.slice(0, 7);
  } else {
    ym = /^\d{4}-\d{2}$/.test(ymRaw || "")
      ? (ymRaw as string)
      : new Date().toISOString().slice(0, 7);
    const [y, m] = ym.split("-").map(Number);
    startDate = `${ym}-01`;
    nextMonth = new Date(y, m, 1).toISOString().slice(0, 10);
  }

  const [{ data: passes }, { data: overrideRules }, { data: defaultRules }] = await Promise.all([
    supabase
      .from("crm_passes")
      .select("id, member_id, lesson_kind, group_capacity, issue_type, price_won, discount_won, total_sessions, issued_at, status, vat_included")
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

  // 매출 내역(회원명·연락처 포함) — 지급액 근거가 된 수강권 매출을 표로 보여주기 위함.
  const recMemberIds = Array.from(
    new Set((passes ?? []).map((p) => (p as { member_id?: number }).member_id).filter((v): v is number => !!v))
  );
  const { data: recMembers } = recMemberIds.length
    ? await supabase
        .from("crm_members")
        .select("id, name, phone")
        .eq("center_id", ctx.centerId)
        .in("id", recMemberIds)
    : { data: [] };
  const recMemberMap = new Map((recMembers ?? []).map((m) => [m.id, m]));
  const ISSUE_LABEL: Record<string, string> = {
    new: "신규",
    renewal: "재등록",
    trial: "체험",
    service: "서비스",
  };
  const records = (passes ?? []).map((p) => {
    const pp = p as {
      id: number;
      member_id?: number;
      lesson_kind?: string;
      group_capacity?: number | null;
      issue_type?: string;
      price_won?: number;
      issued_at?: string;
    };
    const mem = pp.member_id ? recMemberMap.get(pp.member_id) : null;
    const isGroup = (pp.group_capacity ?? 1) > 1;
    return {
      id: pp.id,
      issued_at: pp.issued_at ?? null,
      member_id: pp.member_id ?? null,
      member_name: mem?.name ?? "(회원 미상)",
      member_phone: mem?.phone ?? null,
      product_name: pp.lesson_kind ?? "수강권",
      amount_won: pp.price_won ?? 0,
      issue_type: pp.issue_type ?? null,
      issue_label: pp.issue_type ? ISSUE_LABEL[pp.issue_type] ?? pp.issue_type : null,
      category: isGroup ? "group" : "personal", // 그룹 수업 / 개인 레슨
    };
  });
  // 카테고리별 매출 적용 금액 (개인 레슨 / 그룹 수업)
  const categoryTotals: Record<string, number> = {};
  for (const r of records) {
    categoryTotals[r.category] = (categoryTotals[r.category] ?? 0) + (r.amount_won ?? 0);
  }

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

  // breakdown = 판매(발급) 매출 실적 (매출 탭 표시용). 지급액 산정과는 별개.
  const breakdown = { new: 0, renewal: 0, trial: 0, service: 0, total: 0 };
  const payout = { new: 0, renewal: 0, trial: 0, total: 0 };

  for (const p of passes ?? []) {
    const price = p.price_won ?? 0;
    breakdown.total += price;
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
  // ── 지급액 근거 = "진행(출석) 수업 소진분" ──────────────────────────
  // 판매 시점이 아니라 수업을 진행할 때마다 커미션이 쌓인다.
  //   진행 수업료(회당) = perSessionFee(pass) = 부가세제외가 ÷ 총횟수
  //   revenue(커미션 기준) = Σ(기간 내 출석 예약의 회당 수업료)
  // 기간: startDate~nextMonth (KST) → UTC 변환해 starts_at 으로 조회.
  // 진행 수업 = 출석(attended) + 노쇼(noshow). 둘 다 회차가 소진되는 '수업 진행'으로 처리.
  const startUtc = new Date(`${startDate}T00:00:00+09:00`).toISOString();
  const endUtc = new Date(`${nextMonth}T00:00:00+09:00`).toISOString();
  const { data: attendedRes } = await supabase
    .from("crm_reservations")
    .select("id, pass_id, member_id, status, starts_at")
    .eq("center_id", ctx.centerId)
    .eq("trainer_member_id", trainerId)
    .in("status", ["attended", "noshow"])
    .gte("starts_at", startUtc)
    .lt("starts_at", endUtc)
    .order("starts_at", { ascending: true });
  const attendedPassIds = Array.from(
    new Set((attendedRes ?? []).map((r) => r.pass_id).filter((v): v is number => !!v))
  );
  const attendedMemberIds = Array.from(
    new Set((attendedRes ?? []).map((r) => (r as { member_id?: number }).member_id).filter((v): v is number => !!v))
  );
  const [{ data: sessionPasses }, { data: sessionMembers }] = await Promise.all([
    attendedPassIds.length
      ? supabase
          .from("crm_passes")
          .select("id, price_won, vat_included, total_sessions, lesson_kind")
          .eq("center_id", ctx.centerId)
          .in("id", attendedPassIds)
      : Promise.resolve({ data: [] as { id: number; price_won: number | null; vat_included: boolean | null; total_sessions: number | null; lesson_kind: string | null }[] }),
    attendedMemberIds.length
      ? supabase.from("crm_members").select("id, name, phone").eq("center_id", ctx.centerId).in("id", attendedMemberIds)
      : Promise.resolve({ data: [] as { id: number; name: string; phone: string | null }[] }),
  ]);
  const sessionPassMap = new Map((sessionPasses ?? []).map((p) => [p.id, p]));
  const sessionMemberMap = new Map(
    ((sessionMembers ?? []) as { id: number; name: string; phone: string | null }[]).map((m) => [m.id, m])
  );
  // 회당 수업료(부가세 제외)까지 라인별로 수집 → 아래에서 커미션율 적용해 수업료 산출
  const rawSessionLines: {
    id: number;
    starts_at: string;
    member_id: number | null;
    member_name: string;
    member_phone: string | null;
    lesson_kind: string | null;
    status: string;
    per_session_won: number;
  }[] = [];
  let sessionRevenue = 0;
  let sessionCount = 0;
  for (const r of attendedRes ?? []) {
    const rr = r as { id: number; pass_id: number | null; member_id: number | null; status: string; starts_at: string };
    const p = rr.pass_id ? sessionPassMap.get(rr.pass_id) : null;
    if (!p) continue;
    const per = perSessionFee(p);
    sessionRevenue += per;
    sessionCount += 1;
    const mem = rr.member_id ? sessionMemberMap.get(rr.member_id) : null;
    rawSessionLines.push({
      id: rr.id,
      starts_at: rr.starts_at,
      member_id: rr.member_id,
      member_name: mem?.name ?? "—",
      member_phone: mem?.phone ?? null,
      lesson_kind: p.lesson_kind ?? null,
      status: rr.status,
      per_session_won: per,
    });
  }

  // 커미션 % 는 진행 수업료(부가세 제외) 합 기준
  const revenue = sessionRevenue;
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

  // 라인별 수업료 = 회당 수업료 × 유효 커미션율. (합계 ≈ commissionPayout)
  const sessionLines = rawSessionLines.map((l) => ({
    ...l,
    fee_won: Math.round((l.per_session_won * effectiveRate) / 100),
  }));
  const sessionFeeTotal = sessionLines.reduce((s, l) => s + l.fee_won, 0);

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
  const achieved = bonuses.filter((b) => {
    const actual = b.metric === "sessions" ? sessionCount : revenue;
    return actual >= (Number(b.gte) || 0);
  });
  // 같은 지표(sessions/revenue)끼리는 '가장 높은 달성 구간 1개'만 적용 (누적 합산 X).
  // 예: 진행세션 100/150/200건 구간에서 201건이면 200건 구간(최고)만 적용.
  const bestByMetric = new Map<string, Bonus>();
  for (const b of achieved) {
    const cur = bestByMetric.get(b.metric);
    if (!cur || (Number(b.gte) || 0) > (Number(cur.gte) || 0)) bestByMetric.set(b.metric, b);
  }
  const achievedBonuses = [...bestByMetric.values()];
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
    records,
    category_totals: categoryTotals,
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
    // 진행 수업(출석·노쇼) 라인별 수업료 + 합계 (수업 내역 탭)
    session_lines: sessionLines,
    session_fee_total: sessionFeeTotal,
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
