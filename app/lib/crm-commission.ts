import "server-only";

/**
 * 강사 커미션(수업료 정산) 계산 공용 헬퍼.
 * 출처 로직: app/api/crm/payroll/[memberId]/route.ts (커미션 % 는 부가세 제외 매출 기준).
 * payroll route 는 기존 인라인 로직 유지, 트레이너 대시보드 등 신규 소비처에서 이걸 사용.
 */
export type CommissionTier = { upTo: number | null; rate: number };

export interface CommissionConfig {
  commission_type?: string | null; // "fixed" | "tiered"
  commission_rate?: number | null;
  commission_tiers?: unknown;
}

/** 부가세 제외 매출(revenueExVat)에 대한 유효 커미션 요율(%). tiered 면 revenue <= upTo 구간 rate. */
export function effectiveCommissionRate(cfg: CommissionConfig, revenueExVat: number): number {
  const type = (cfg?.commission_type as string) ?? "fixed";
  const rate = Number(cfg?.commission_rate ?? 0);
  const tiers: CommissionTier[] = Array.isArray(cfg?.commission_tiers)
    ? (cfg.commission_tiers as CommissionTier[])
    : [];
  if (type === "tiered") {
    const sorted = [...tiers].sort(
      (a, b) => (a.upTo ?? Number.POSITIVE_INFINITY) - (b.upTo ?? Number.POSITIVE_INFINITY)
    );
    const tier = sorted.find((t) => t.upTo == null || revenueExVat <= t.upTo);
    return tier ? Number(tier.rate) : 0;
  }
  return rate;
}

/** 커미션 정산액 = 매출(부가세 제외) × 유효요율. */
export function commissionPayout(cfg: CommissionConfig, revenueExVat: number): number {
  return Math.round((revenueExVat * effectiveCommissionRate(cfg, revenueExVat)) / 100);
}

/**
 * 수강권 1건의 회당 수업료(부가세 제외). total_sessions 0 이면 전액.
 * 기준액 = 최종 결제 금액(정가 price_won − 할인 discount_won).
 * 부가세 포함 건은 최종 결제 금액에서 부가세(÷1.1)를 뺀 공급가 기준.
 * 예) 정가 66만(부가세포함) − 할인 6만 = 60만 → 부가세제외 545,454 ÷ 총횟수.
 */
export function perSessionFee(pass: {
  price_won?: number | null;
  discount_won?: number | null;
  vat_included?: boolean | null;
  total_sessions?: number | null;
}): number {
  const net = Math.max(0, (pass.price_won ?? 0) - (pass.discount_won ?? 0));
  const exVat = pass.vat_included ? Math.round(net / 1.1) : net;
  const total = pass.total_sessions ?? 0;
  return total > 0 ? Math.round(exVat / total) : exVat;
}
