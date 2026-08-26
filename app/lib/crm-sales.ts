import { supabase } from "@/app/lib/supabase";

/**
 * crm_sales = BROJ "매출내역_상품결제단위" 실제 거래(결제) 원장.
 * 매출 리포트는 발급(crm_memberships/passes/rentals)이 아니라 이 원장을 매출 소스로 사용.
 * 환불은 amount_won 이 음수로 저장돼 있어 sum 하면 순매출.
 */

export type SaleRow = {
  tx_at: string;
  amount_won: number;
  product_type: string | null;
  member_id: number | null;
  cash_won: number;
  card_won: number;
  culture_won: number;
  registration_type: string | null;   // '신규' | '재등록' | null
};

export type SalesCategory = "membership" | "lesson" | "rental" | "locker" | "goods";

/** 상품타입 → 리포트 카테고리 */
export function saleCategory(productType: string | null): SalesCategory {
  switch (productType) {
    case "멤버십":
      return "membership";
    case "이용권":
    case "예약권":
    case "수강권": // 신규 임포트분(PT 수강권) — 기존 이용권/예약권과 동일 그룹
      return "lesson";
    case "대여권":
    case "SPORTS": // 신규 임포트분(운동복 대여) — 대여권과 동일 그룹
      return "rental";
    case "락커":
      return "locker";
    default:
      return "goods"; // 일반 등
  }
}

/** tx_at(UTC timestamptz) → KST "YYYY-MM" */
export function saleYm(txAt: string): string {
  return new Date(new Date(txAt).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 7);
}

/**
 * KST 날짜 범위 [startYmd, endExclYmd) 의 crm_sales 원장 조회 (페이지네이션).
 * startYmd/endExclYmd 는 "YYYY-MM-DD".
 */
export async function fetchSales(
  centerId: number,
  startYmd: string,
  endExclYmd: string
): Promise<SaleRow[]> {
  const out: SaleRow[] = [];
  const chunk = 1000;
  for (let from = 0; ; from += chunk) {
    const { data, error } = await supabase
      .from("crm_sales")
      .select("tx_at, amount_won, product_type, member_id, cash_won, card_won, culture_won, registration_type")
      .eq("center_id", centerId)
      .gte("tx_at", `${startYmd}T00:00:00+09:00`)
      .lt("tx_at", `${endExclYmd}T00:00:00+09:00`)
      .range(from, from + chunk - 1);
    if (error) throw error;
    const rows = (data ?? []) as SaleRow[];
    out.push(...rows);
    if (rows.length < chunk) break;
  }
  return out;
}

/** 카테고리별 매출 합계 (빈 버킷 0 초기화) */
export function emptyCategorySums(): Record<SalesCategory, number> {
  return { membership: 0, lesson: 0, rental: 0, locker: 0, goods: 0 };
}
