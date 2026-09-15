import "server-only";
import { supabase } from "@/app/lib/supabase";

/**
 * 직원 수업료(급여) 설정 이력 — crm_staff_pay_history.
 *
 * 🚨 규칙: 급여·수업료 계산은 crm_center_members 의 현재 설정을 직접 쓰지 말고
 *    '수업한 날짜에 유효한 설정'(effective_from <= 수업일 중 가장 늦은 버전)을 쓴다.
 *    그래야 설정을 바꿔도 과거 달 통계·급여가 다시 계산되지 않는다. (2026-09-15)
 *
 *  - 수업료(커미션): 수업일 기준 버전의 요율. 구간(tiered)은 그 달 전체 수업 매출로 구간을 정한다.
 *  - 고정급·현금 지급·성과급 조건: 그 달 '말일' 기준 버전.
 */

export type CommissionTier = { upTo: number | null; rate: number };
export type CommissionBonus = {
  metric: string;
  gte: number;
  reward_type?: string;
  bonus_won?: number;
  bonus_percent?: number;
};

export interface PayConfig {
  /** 적용 시작일 YYYY-MM-DD */
  effective_from: string;
  commission_type: string | null;
  commission_rate: number | null;
  commission_tiers: CommissionTier[] | null;
  base_salary: number | null;
  cash_pay_enabled: boolean | null;
  cash_pay_won: number | null;
  commission_bonuses: CommissionBonus[] | null;
}

export const PAY_FIELDS =
  "commission_type, commission_rate, commission_tiers, base_salary, cash_pay_enabled, cash_pay_won, commission_bonuses";

type PayRowLike = {
  commission_type?: unknown;
  commission_rate?: unknown;
  commission_tiers?: unknown;
  base_salary?: unknown;
  cash_pay_enabled?: unknown;
  cash_pay_won?: unknown;
  commission_bonuses?: unknown;
};

function normalize(row: PayRowLike, effectiveFrom: string): PayConfig {
  return {
    effective_from: effectiveFrom,
    commission_type: (row.commission_type as string | null) ?? "fixed",
    commission_rate: row.commission_rate == null ? 0 : Number(row.commission_rate),
    commission_tiers: Array.isArray(row.commission_tiers) ? (row.commission_tiers as CommissionTier[]) : [],
    base_salary: row.base_salary == null ? 0 : Number(row.base_salary),
    cash_pay_enabled: !!row.cash_pay_enabled,
    cash_pay_won: row.cash_pay_won == null ? 0 : Number(row.cash_pay_won),
    commission_bonuses: Array.isArray(row.commission_bonuses) ? (row.commission_bonuses as CommissionBonus[]) : [],
  };
}

/** crm_center_members 현재 설정을 '시작일 없는 버전'으로 — 이력이 없는 직원 폴백 */
export function payConfigFromMember(row: PayRowLike | null | undefined): PayConfig | null {
  return row ? normalize(row, "0000-01-01") : null;
}

/** 직원별 이력 (effective_from 오름차순) */
export async function loadPayHistory(
  centerId: number,
  memberIds: number[]
): Promise<Map<number, PayConfig[]>> {
  const out = new Map<number, PayConfig[]>();
  const ids = Array.from(new Set(memberIds.filter(Boolean)));
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await supabase
      .from("crm_staff_pay_history")
      .select(`center_member_id, effective_from, ${PAY_FIELDS}`)
      .eq("center_id", centerId)
      .in("center_member_id", ids.slice(i, i + 500))
      .order("effective_from", { ascending: true });
    for (const r of (data ?? []) as (PayRowLike & { center_member_id: number; effective_from: string })[]) {
      const list = out.get(r.center_member_id) ?? [];
      list.push(normalize(r, String(r.effective_from).slice(0, 10)));
      out.set(r.center_member_id, list);
    }
  }
  return out;
}

/** ymd 에 유효한 설정 = effective_from <= ymd 중 가장 늦은 버전. 없으면 fallback */
export function payConfigAt(
  versions: PayConfig[] | undefined,
  ymd: string,
  fallback: PayConfig | null
): PayConfig | null {
  let hit: PayConfig | null = null;
  for (const v of versions ?? []) {
    if (v.effective_from <= ymd) hit = v;
    else break;
  }
  return hit ?? (versions && versions.length > 0 ? null : fallback);
}

/** 수업료 설정이 실제로 있는지 (고정% > 0 또는 구간 설정 존재) */
export function hasCommissionConfig(cfg: PayConfig | null): boolean {
  if (!cfg) return false;
  if (cfg.commission_type === "tiered") return (cfg.commission_tiers ?? []).length > 0;
  return Number(cfg.commission_rate ?? 0) > 0;
}

/** 설정의 유효 요율(%) — 구간형은 monthRevenue 가 속한 구간 비율 */
export function rateOf(cfg: PayConfig | null, monthRevenue: number): number {
  if (!cfg) return 0;
  if (cfg.commission_type === "tiered") {
    const sorted = [...(cfg.commission_tiers ?? [])].sort(
      (a, b) => (a.upTo ?? Number.POSITIVE_INFINITY) - (b.upTo ?? Number.POSITIVE_INFINITY)
    );
    const tier = sorted.find((t) => t.upTo == null || monthRevenue <= t.upTo);
    return tier ? Number(tier.rate) : 0;
  }
  return Number(cfg.commission_rate ?? 0);
}

export const kstYmdOf = (iso: string) =>
  new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);

/** YYYY-MM 의 말일 YYYY-MM-DD */
export function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ym}-${String(d).padStart(2, "0")}`;
}

/** 그 달 말일 기준 설정 (고정급·현금·성과급 조건용) */
export function monthEndConfig(
  versions: PayConfig[] | undefined,
  ym: string,
  fallback: PayConfig | null
): PayConfig | null {
  return payConfigAt(versions, lastDayOfMonth(ym), fallback);
}

export interface SessionFee {
  /** 수업 시작 시각 (ISO) */
  at: string;
  /** 회당 수업료(부가세 제외) */
  fee: number;
}

export interface MonthlyCommission {
  revenue: number;
  payout: number;
  sessions: number;
  /** 실효 요율(%) = payout / revenue × 100. 매출 0 이면 말일 기준 설정 요율 */
  effectiveRate: number;
  /** 이 달에 적용된 버전 중 하나라도 수업료 설정이 있으면 true */
  hasCommission: boolean;
  /** 설정이 달 중간에 바뀌어 두 개 이상 버전이 쓰였는지 */
  split: boolean;
  /** 수업 1건의 적용 요율(%) — 라인별 표시용 */
  rateAt: (atIso: string) => number;
}

/**
 * 한 달치 수업 목록 → 수업료.
 * 수업일에 유효한 버전별로 묶어 (묶음 매출 × 그 버전 요율)을 합산.
 * 구간형 요율의 구간은 그 달 전체 수업 매출로 결정.
 */
export function monthlyCommission(
  sessions: SessionFee[],
  versions: PayConfig[] | undefined,
  fallback: PayConfig | null,
  ym: string
): MonthlyCommission {
  const revenue = sessions.reduce((s, x) => s + x.fee, 0);
  const groups = new Map<string, { cfg: PayConfig | null; rev: number }>();
  let any = false;
  for (const s of sessions) {
    const cfg = payConfigAt(versions, kstYmdOf(s.at), fallback);
    const key = cfg?.effective_from ?? "none";
    const g = groups.get(key) ?? { cfg, rev: 0 };
    g.rev += s.fee;
    groups.set(key, g);
    if (hasCommissionConfig(cfg)) any = true;
  }
  let payout = 0;
  for (const g of groups.values()) payout += Math.round((g.rev * rateOf(g.cfg, revenue)) / 100);
  const endCfg = monthEndConfig(versions, ym, fallback);
  if (sessions.length === 0 && hasCommissionConfig(endCfg)) any = true;
  return {
    revenue,
    payout,
    sessions: sessions.length,
    effectiveRate: revenue > 0 ? (payout / revenue) * 100 : rateOf(endCfg, 0),
    hasCommission: any,
    split: groups.size > 1,
    rateAt: (atIso: string) => rateOf(payConfigAt(versions, kstYmdOf(atIso), fallback), revenue),
  };
}

/** 성과급 — 지표(revenue/sessions)별 '가장 높은 달성 구간 1개'만 (누적 X) */
export function bonusPayoutOf(
  cfg: PayConfig | null,
  revenue: number,
  sessionCount: number,
  commission: number
): { payout: number; achieved: CommissionBonus[] } {
  const bonuses = cfg?.commission_bonuses ?? [];
  const best = new Map<string, CommissionBonus>();
  for (const b of bonuses) {
    const actual = b.metric === "sessions" ? sessionCount : revenue;
    if (actual < (Number(b.gte) || 0)) continue;
    const cur = best.get(b.metric);
    if (!cur || (Number(b.gte) || 0) > (Number(cur.gte) || 0)) best.set(b.metric, b);
  }
  const achieved = [...best.values()];
  const payout = achieved.reduce((sum, b) => {
    if (b.reward_type === "percent") return sum + Math.round((commission * (Number(b.bonus_percent) || 0)) / 100);
    return sum + Math.max(0, Number(b.bonus_won) || 0);
  }, 0);
  return { payout, achieved };
}

/**
 * 새 설정 버전 저장. 같은 적용일 버전이 있으면 덮어쓴다.
 * 이력이 비어 있는 직원은 '변경 전 값'을 기준 버전(2000-01-01)으로 먼저 남겨,
 * 적용일 이전 기간이 새 설정으로 바뀌지 않게 한다.
 */
export async function savePayVersion(opts: {
  centerId: number;
  memberId: number;
  effectiveFrom: string;
  before: PayRowLike;
  after: PayRowLike;
  uid: string;
}): Promise<void> {
  const { count } = await supabase
    .from("crm_staff_pay_history")
    .select("id", { count: "exact", head: true })
    .eq("center_member_id", opts.memberId);
  if (!count) {
    const b = normalize(opts.before, "2000-01-01");
    await supabase.from("crm_staff_pay_history").insert({
      center_id: opts.centerId,
      center_member_id: opts.memberId,
      effective_from: "2000-01-01",
      commission_type: b.commission_type,
      commission_rate: b.commission_rate,
      commission_tiers: b.commission_tiers as never,
      base_salary: b.base_salary,
      cash_pay_enabled: b.cash_pay_enabled,
      cash_pay_won: b.cash_pay_won,
      commission_bonuses: b.commission_bonuses as never,
      note: "이력 도입 시점 설정(기준)",
    } as never);
  }
  const a = normalize(opts.after, opts.effectiveFrom);
  await supabase.from("crm_staff_pay_history").upsert(
    {
      center_id: opts.centerId,
      center_member_id: opts.memberId,
      effective_from: opts.effectiveFrom,
      commission_type: a.commission_type,
      commission_rate: a.commission_rate,
      commission_tiers: a.commission_tiers as never,
      base_salary: a.base_salary,
      cash_pay_enabled: a.cash_pay_enabled,
      cash_pay_won: a.cash_pay_won,
      commission_bonuses: a.commission_bonuses as never,
      created_by_uid: opts.uid,
    } as never,
    { onConflict: "center_member_id,effective_from" }
  );
}
