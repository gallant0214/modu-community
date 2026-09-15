import { supabase } from "@/app/lib/supabase";
import { fetchSales, saleCategory, type SalesCategory } from "@/app/lib/crm-sales";
import { perSessionFee } from "@/app/lib/crm-commission";

/**
 * 센터 정산(손익) 계산 공용 로직.
 * 통계 '정산' 탭(/api/crm/stats/settlement)과 '경영 요약' 탭(/api/crm/stats/business-summary)이 같이 쓴다.
 *
 * 순이익 = 총매출 − 고정지출 − 부가세(납부예상) − 카드수수료 − 직원급여 − 추가지출 + 추가수입
 *  - 총매출: 실매출 원장 crm_sales(컷오프까지) + 컷오프 이후 CRM 발급분. 부가세 포함가.
 *  - 부가세 납부예상 = 매출세액(총매출 ÷ 11) − 매입세액(세금계산서 받은 지출 ÷ 11)
 *  - 카드수수료 = 카드 매출 × 센터 설정 수수료율(%)
 *  - 고정지출: crm_fixed_expenses 월합 × 기간 개월수
 *  - 직원급여: 고정급·현금(고정) + 수업료·성과급(변동). 수업료는 진행 소진 기준
 *  - 추가지출/수입: 기간에 속한 월(ym) 합
 */

const VAT_RATE = 0.1;

export interface SettlementPeriod {
  /** 기간 대표 월(YYYY-MM) — 추가지출 귀속월 폴백 */
  ym: string;
  /** 포함 시작일 YYYY-MM-DD (KST) */
  startDate: string;
  /** 미포함 종료일 YYYY-MM-DD (KST) */
  nextMonth: string;
}

export interface StaffPay {
  id: number;
  name: string;
  base: number;
  commission: number;
  bonus: number;
  cash: number;
  total: number;
}

export interface SettlementResult {
  ym: string;
  months: string[];
  months_in_period: number;
  total_revenue: number;
  total_ex_vat: number;
  /** 매출세액 (기존 필드명 유지, = output_vat) */
  vat_amount: number;
  /** 매출세액 = 부가세 포함 매출 ÷ 11 */
  output_vat: number;
  /** 매입세액 = 세금계산서 받은 지출 ÷ 11 */
  input_vat: number;
  /** 부가세 납부 예상 = max(0, 매출세액 − 매입세액) */
  vat_payable: number;
  card_sales: number;
  card_fee_percent: number;
  card_fee: number;
  fixed_monthly: number;
  fixed_total: number;
  fixed_items: number;
  fixed_deductible_monthly: number;
  salary_total: number;
  /** 고정급 + 현금 지급 (매출과 무관하게 나가는 인건비) */
  salary_fixed: number;
  /** 수업료 + 성과급 (매출·수업량에 따라 변하는 인건비) */
  salary_variable: number;
  staff_breakdown: StaffPay[];
  additional_total: number;
  additional_deductible_total: number;
  additional_income_total: number;
  /** 총지출 = 고정지출 + 부가세납부 + 직원급여 + 추가지출 + 카드수수료 */
  total_expense: number;
  /** 매출 대비 지출 (총매출 0 이면 null) */
  expense_ratio: number | null;
  /** 매출 대비 인건비 */
  labor_ratio: number | null;
  net_profit: number;
  /** 순이익률 */
  net_margin: number | null;
  /** 매출 구성 (부가세 포함) */
  revenue_mix: Record<SalesCategory, number>;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
function nextMonthStart(y: number, m: number): string {
  return m === 12 ? `${y + 1}-01-01` : `${y}-${pad2(m + 1)}-01`;
}

/** YYYY-MM 한 달 기간 */
export function monthPeriod(ym: string): SettlementPeriod {
  const [y, m] = ym.split("-").map(Number);
  return { ym, startDate: `${ym}-01`, nextMonth: nextMonthStart(y, m) };
}

/** 쿼리스트링 → 기간. ?quarter=YYYY-Q# | ?from&to | ?ym (없으면 KST 이번 달) */
export function resolveSettlementPeriod(sp: URLSearchParams): SettlementPeriod {
  const qm = /^(\d{4})-Q([1-4])$/.exec(sp.get("quarter") || "");
  if (qm) {
    const y = Number(qm[1]);
    const startM = (Number(qm[2]) - 1) * 3 + 1;
    return {
      ym: `${y}-${pad2(startM)}`,
      startDate: `${y}-${pad2(startM)}-01`,
      nextMonth: nextMonthStart(y, startM + 2),
    };
  }
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  const from = sp.get("from");
  const to = sp.get("to");
  const ymRaw = sp.get("ym");
  const kstYm = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 7);
  const ym = /^\d{4}-\d{2}$/.test(ymRaw || "") ? (ymRaw as string) : kstYm;
  if (from && to && ymd.test(from) && ymd.test(to) && to >= from) {
    const d = new Date(`${to}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return { ym, startDate: from, nextMonth: d.toISOString().slice(0, 10) };
  }
  return monthPeriod(ym);
}

/** startDate(포함) ~ endExclusive(미포함) 사이의 YYYY-MM 목록 */
export function listMonths(startDate: string, endExclusive: string): string[] {
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

/** ⚠️ supabase select 기본 1000행 상한 → 기간이 길면 반드시 페이지네이션 */
async function pageAll<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data } = await run(from, from + size - 1);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < size) break;
  }
  return out;
}

export async function computeSettlement(
  centerId: number,
  period: SettlementPeriod
): Promise<SettlementResult> {
  const { ym, startDate, nextMonth } = period;
  const monthsList = listMonths(startDate, nextMonth);
  const monthsInPeriod = Math.max(1, monthsList.length);
  const revenueMix: Record<SalesCategory, number> = {
    membership: 0,
    lesson: 0,
    rental: 0,
    locker: 0,
    goods: 0,
  };

  // ── 총매출: 실매출 원장 crm_sales (환불 음수) ──
  const periodSales = await fetchSales(centerId, startDate, nextMonth);
  let totalRevenue = 0;
  let cardSales = 0;
  for (const s of periodSales) {
    totalRevenue += s.amount_won;
    cardSales += s.card_won ?? 0;
    revenueMix[saleCategory(s.product_type)] += s.amount_won;
  }

  // 원장은 임포트 컷오프까지만 커버 → 컷오프 이후 CRM 신규 발급·결제를 합산(이중집계 방지)
  const { data: maxSale } = await supabase
    .from("crm_sales")
    .select("tx_at")
    .eq("center_id", centerId)
    .order("tx_at", { ascending: false })
    .limit(1);
  const maxTx = (maxSale?.[0] as { tx_at?: string } | undefined)?.tx_at;
  const cutoffYmd = maxTx
    ? new Date(new Date(maxTx).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
    : null;
  const nextYmd = (v: string) => {
    const d = new Date(`${v}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  };
  const issuanceStart = cutoffYmd
    ? nextYmd(cutoffYmd) > startDate
      ? nextYmd(cutoffYmd)
      : startDate
    : startDate;
  if (issuanceStart < nextMonth) {
    const [im, ip, ir, cardPays] = await Promise.all([
      pageAll<{ price_won: number | null }>((f, t) =>
        supabase
          .from("crm_memberships")
          .select("price_won")
          .eq("center_id", centerId)
          .gte("start_date", issuanceStart)
          .lt("start_date", nextMonth)
          .range(f, t)
      ),
      pageAll<{ price_won: number | null }>((f, t) =>
        supabase
          .from("crm_passes")
          .select("price_won")
          .eq("center_id", centerId)
          .gte("issued_at", issuanceStart)
          .lt("issued_at", nextMonth)
          .range(f, t)
      ),
      pageAll<{ price_won: number | null }>((f, t) =>
        supabase
          .from("crm_rentals")
          .select("price_won")
          .eq("center_id", centerId)
          .gte("start_date", issuanceStart)
          .lt("start_date", nextMonth)
          .range(f, t)
      ),
      // 컷오프 이후 카드 결제액 (카드 수수료 계산용)
      pageAll<{ amount_won: number | null }>((f, t) =>
        supabase
          .from("crm_payments")
          .select("amount_won")
          .eq("center_id", centerId)
          .eq("method", "card")
          .eq("status", "completed")
          .gte("paid_at", `${issuanceStart}T00:00:00+09:00`)
          .lt("paid_at", `${nextMonth}T00:00:00+09:00`)
          .range(f, t)
      ),
    ]);
    for (const m of im) {
      const v = m.price_won ?? 0;
      totalRevenue += v;
      revenueMix.membership += v;
    }
    for (const p of ip) {
      const v = p.price_won ?? 0;
      totalRevenue += v;
      revenueMix.lesson += v;
    }
    for (const r of ir) {
      const v = r.price_won ?? 0;
      totalRevenue += v;
      revenueMix.rental += v;
    }
    for (const c of cardPays) cardSales += c.amount_won ?? 0;
  }

  const totalExVat = Math.round(totalRevenue / (1 + VAT_RATE));
  const outputVat = totalRevenue - totalExVat;

  // ── 강사 수업료 기준 = 진행 소진분 (출석 + 노쇼) ──
  const startUtcS = new Date(`${startDate}T00:00:00+09:00`).toISOString();
  const endUtcS = new Date(`${nextMonth}T00:00:00+09:00`).toISOString();
  const attRes = await pageAll<{ pass_id: number | null; trainer_member_id: number | null }>((f, t) =>
    supabase
      .from("crm_reservations")
      .select("pass_id, trainer_member_id")
      .eq("center_id", centerId)
      .in("status", ["attended", "noshow"])
      .gte("starts_at", startUtcS)
      .lt("starts_at", endUtcS)
      .range(f, t)
  );
  const attPassIds = Array.from(
    new Set(attRes.map((r) => r.pass_id).filter((v): v is number => !!v))
  );
  const attPassMap = new Map<number, Parameters<typeof perSessionFee>[0]>();
  for (let i = 0; i < attPassIds.length; i += 500) {
    const { data } = await supabase
      .from("crm_passes")
      .select("id, price_won, discount_won, vat_included, total_sessions")
      .eq("center_id", centerId)
      .in("id", attPassIds.slice(i, i + 500));
    for (const p of data ?? []) attPassMap.set(p.id, p);
  }
  const revenueByTrainer = new Map<number, number>();
  const sessionCountByTrainer = new Map<number, number>();
  for (const r of attRes) {
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

  // ── 고정 지출 ──
  const { data: fixedRows } = await supabase
    .from("crm_fixed_expenses")
    .select("amount_won, vat_deductible")
    .eq("center_id", centerId)
    .eq("status", "active");
  const fixedList = fixedRows ?? [];
  const fixedMonthly = fixedList.reduce((s, x) => s + (x.amount_won ?? 0), 0);
  const fixedDeductibleMonthly = fixedList
    .filter((x) => x.vat_deductible)
    .reduce((s, x) => s + (x.amount_won ?? 0), 0);
  const fixedTotal = fixedMonthly * monthsInPeriod;

  // ── 직원 급여 (직원급여 상세 payroll 과 동일 규칙) ──
  type Tier = { upTo: number | null; rate: number };
  type Bonus = { metric: string; gte: number; reward_type?: string; bonus_won?: number; bonus_percent?: number };
  const { data: staff } = await supabase
    .from("crm_center_members")
    .select(
      "id, display_name, role, commission_type, commission_rate, commission_tiers, base_salary, commission_bonuses, cash_pay_enabled, cash_pay_won"
    )
    .eq("center_id", centerId)
    .eq("status", "active")
    .in("role", ["owner", "admin", "manager", "trainer"]);

  const staffBreakdown: StaffPay[] = [];
  let salaryTotal = 0;
  let salaryFixed = 0;
  let salaryVariable = 0;
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

    // 성과급: 지표별 '가장 높은 달성 구간 1개'만 (누적 X)
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

    const cash = s.cash_pay_enabled ? Math.max(0, Number(s.cash_pay_won ?? 0)) * monthsInPeriod : 0;

    const pay = base + commission + bonus + cash;
    if (pay <= 0) continue;
    staffBreakdown.push({ id: s.id, name: s.display_name ?? "", base, commission, bonus, cash, total: pay });
    salaryTotal += pay;
    salaryFixed += base + cash;
    salaryVariable += commission + bonus;
  }
  staffBreakdown.sort((a, b) => b.total - a.total);

  // ── 추가 지출 / 수입 (기간 내 월) ──
  const monthsFilter = monthsList.length ? monthsList : [ym];
  const { data: addRows } = await supabase
    .from("crm_additional_expenses")
    .select("amount_won, ym, vat_deductible")
    .eq("center_id", centerId)
    .in("ym", monthsFilter);
  const additionalTotal = (addRows ?? []).reduce((s, x) => s + (x.amount_won ?? 0), 0);
  const additionalDeductibleTotal = (addRows ?? [])
    .filter((x) => x.vat_deductible)
    .reduce((s, x) => s + (x.amount_won ?? 0), 0);

  const { data: incRows } = await supabase
    .from("crm_additional_incomes")
    .select("amount_won, ym")
    .eq("center_id", centerId)
    .in("ym", monthsFilter);
  const additionalIncomeTotal = (incRows ?? []).reduce((s, x) => s + (x.amount_won ?? 0), 0);

  // ── 카드 수수료 ──
  const { data: settingRow } = await supabase
    .from("crm_center_settings")
    .select("card_fee_percent")
    .eq("center_id", centerId)
    .maybeSingle();
  const cardFeePercent =
    Number((settingRow as { card_fee_percent?: number | string | null } | null)?.card_fee_percent ?? 0) || 0;
  const cardFee = Math.round((Math.max(0, cardSales) * cardFeePercent) / 100);

  // ── 부가세: 매출세액 − 매입세액 ──
  const inputVat = Math.round((fixedDeductibleMonthly * monthsInPeriod + additionalDeductibleTotal) / 11);
  const vatPayable = Math.max(0, outputVat - inputVat);

  const totalExpense = fixedTotal + vatPayable + salaryTotal + additionalTotal + cardFee;
  const netProfit = totalRevenue - totalExpense + additionalIncomeTotal;
  const ratio = (v: number) => (totalRevenue > 0 ? v / totalRevenue : null);

  return {
    ym,
    months: monthsList,
    months_in_period: monthsInPeriod,
    total_revenue: totalRevenue,
    total_ex_vat: totalExVat,
    vat_amount: outputVat,
    output_vat: outputVat,
    input_vat: inputVat,
    vat_payable: vatPayable,
    card_sales: cardSales,
    card_fee_percent: cardFeePercent,
    card_fee: cardFee,
    fixed_monthly: fixedMonthly,
    fixed_total: fixedTotal,
    fixed_items: fixedList.length,
    fixed_deductible_monthly: fixedDeductibleMonthly,
    salary_total: salaryTotal,
    salary_fixed: salaryFixed,
    salary_variable: salaryVariable,
    staff_breakdown: staffBreakdown,
    additional_total: additionalTotal,
    additional_deductible_total: additionalDeductibleTotal,
    additional_income_total: additionalIncomeTotal,
    total_expense: totalExpense,
    expense_ratio: ratio(totalExpense),
    labor_ratio: ratio(salaryTotal),
    net_profit: netProfit,
    net_margin: ratio(netProfit),
    revenue_mix: revenueMix,
  };
}
