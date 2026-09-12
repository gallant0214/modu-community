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
  /** 원장 결제채널('카드'/'현금'/'계좌이체'/'현금+카드' 등) — 계좌이체 구분에 필요 */
  payment_channel: string | null;
  registration_type: string | null;   // '신규' | '재등록' | null
  /** 원장에 member_id 가 비어 있을 때 회원 매칭용(임포트분 일부가 미연결) */
  customer_phone: string | null;
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
      .select("tx_at, amount_won, product_type, member_id, cash_won, card_won, culture_won, payment_channel, registration_type, customer_phone")
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

/** 전화번호 숫자만 (회원 매칭 키) */
function phoneKey(p: string | null | undefined): string {
  return (p ?? "").replace(/\D/g, "");
}

export interface RegistrationClassifier {
  /** 한 건의 매출을 신규/재등록/미분류로 분류 */
  classify(
    memberId: number | null | undefined,
    phone: string | null | undefined,
    rowYmd: string | null | undefined
  ): "new" | "renewal" | "unknown";
}

/**
 * 신규/재등록 판정기.
 *
 * 판정 기준(사용자 정의):
 *   신규   = 그 회원이 **처음** 상품을 구매한 건
 *   재등록 = 이미 구매 이력이 있는 회원의 추가 구매
 *
 * 저장된 플래그(crm_sales.registration_type · crm_passes.issue_type)는 신뢰하지 않는다.
 * 임포트분·수기 발급분마다 값이 제각각이고(한글 '신규' / 영문 'NEW' / 누락),
 * crm_memberships 에는 아예 컬럼이 없어 전부 '미분류'로 빠졌다.
 * 대신 실제 구매 이력에서 회원별 최초 구매일을 구해 그 날짜와 비교한다.
 *
 * 원장에 member_id 가 비어 있는 건은 연락처로 회원을 찾아 함께 판정한다.
 */
export async function buildRegistrationClassifier(
  centerId: number
): Promise<RegistrationClassifier> {
  const page = async <T>(
    run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
  ): Promise<T[]> => {
    const out: T[] = [];
    const chunk = 1000;
    // ⚠️ supabase select 기본 1000행 상한 → 반드시 range 페이지네이션
    for (let from = 0; ; from += chunk) {
      const { data } = await run(from, from + chunk - 1);
      const rows = (data ?? []) as T[];
      out.push(...rows);
      if (rows.length < chunk) break;
    }
    return out;
  };

  const [members, sales, memberships, passes, rentals] = await Promise.all([
    page<{ id: number; phone: string | null }>((f, t) =>
      supabase.from("crm_members").select("id, phone").eq("center_id", centerId).range(f, t)
    ),
    page<{ member_id: number | null; customer_phone: string | null; tx_at: string }>((f, t) =>
      supabase
        .from("crm_sales")
        .select("member_id, customer_phone, tx_at")
        .eq("center_id", centerId)
        .gt("amount_won", 0)
        .range(f, t)
    ),
    page<{ member_id: number | null; start_date: string | null; purchased_at: string | null }>((f, t) =>
      supabase
        .from("crm_memberships")
        .select("member_id, start_date, purchased_at")
        .eq("center_id", centerId)
        .range(f, t)
    ),
    page<{ member_id: number | null; issued_at: string | null }>((f, t) =>
      supabase.from("crm_passes").select("member_id, issued_at").eq("center_id", centerId).range(f, t)
    ),
    page<{ member_id: number | null; start_date: string | null }>((f, t) =>
      supabase.from("crm_rentals").select("member_id, start_date").eq("center_id", centerId).range(f, t)
    ),
  ]);

  const idByPhone = new Map<string, number>();
  for (const m of members) {
    const k = phoneKey(m.phone);
    if (k && !idByPhone.has(k)) idByPhone.set(k, m.id);
  }
  const resolve = (memberId: number | null | undefined, phone: string | null | undefined) =>
    memberId ?? idByPhone.get(phoneKey(phone)) ?? null;

  const firstDate = new Map<number, string>();
  const put = (memberId: number | null, ymd: string | null | undefined) => {
    if (!memberId || !ymd) return;
    const d = ymd.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    const cur = firstDate.get(memberId);
    if (!cur || d < cur) firstDate.set(memberId, d);
  };
  const kstYmd = (iso: string) =>
    new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);

  for (const r of sales) put(resolve(r.member_id, r.customer_phone), kstYmd(r.tx_at));
  for (const r of memberships) put(resolve(r.member_id, null), r.purchased_at ?? r.start_date);
  for (const r of passes) put(resolve(r.member_id, null), r.issued_at);
  for (const r of rentals) put(resolve(r.member_id, null), r.start_date);

  return {
    classify(memberId, phone, rowYmd) {
      if (!rowYmd) return "unknown";
      const id = resolve(memberId, phone);
      if (!id) return "unknown";
      const first = firstDate.get(id);
      if (!first) return "unknown";
      return rowYmd.slice(0, 10) <= first ? "new" : "renewal";
    },
  };
}
