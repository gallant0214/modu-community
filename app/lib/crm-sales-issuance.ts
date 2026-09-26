import { supabase } from "@/app/lib/supabase";
import { rentalKindKey } from "@/app/lib/crm-locker-sync";
import type { SalesCategory } from "@/app/lib/crm-sales";

/**
 * BROJ 매출 원장(crm_sales)은 엑셀 이관 시점까지만 채워져 있다.
 * 그 이후(= CRM 에서 직접 발급한 건)의 매출은 발급 테이블에서 합산해야 한다.
 * 정산(app/lib/crm-settlement.ts)·통계(center-revenue)가 쓰던 규칙을 여기로 모아
 * 대시보드까지 같은 숫자를 쓰게 한다.
 */

export interface IssuanceSale {
  amount_won: number;
  category: SalesCategory;
  member_id: number | null;
}

async function pageAll<T>(
  q: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>
): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data } = await q(from, from + size - 1);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < size) break;
  }
  return out;
}

const nextYmd = (v: string) => {
  const d = new Date(`${v}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** 원장이 커버하는 마지막 날(KST). 원장이 아예 없으면 null. */
export async function salesCutoffYmd(centerId: number): Promise<string | null> {
  const { data } = await supabase
    .from("crm_sales")
    .select("tx_at")
    .eq("center_id", centerId)
    .order("tx_at", { ascending: false })
    .limit(1);
  const maxTx = (data?.[0] as { tx_at?: string } | undefined)?.tx_at;
  if (!maxTx) return null;
  return new Date(new Date(maxTx).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * [startYmd, endExclYmd) 중 **원장이 커버하지 못하는 구간**의 발급 매출.
 * 원장 컷오프 다음날부터만 집계하므로 fetchSales() 결과와 그대로 더해도 이중집계되지 않는다.
 */
export async function fetchIssuanceSales(
  centerId: number,
  startYmd: string,
  endExclYmd: string
): Promise<IssuanceSale[]> {
  const cutoff = await salesCutoffYmd(centerId);
  const from = cutoff && nextYmd(cutoff) > startYmd ? nextYmd(cutoff) : startYmd;
  if (from >= endExclYmd) return [];

  const [ms, ps, rs] = await Promise.all([
    pageAll<{ price_won: number | null; member_id: number | null }>((f, t) =>
      supabase
        .from("crm_memberships")
        .select("price_won, member_id")
        .eq("center_id", centerId)
        .gte("start_date", from)
        .lt("start_date", endExclYmd)
        .range(f, t)
    ),
    pageAll<{ price_won: number | null; member_id: number | null }>((f, t) =>
      supabase
        .from("crm_passes")
        .select("price_won, member_id")
        .eq("center_id", centerId)
        .gte("issued_at", from)
        .lt("issued_at", endExclYmd)
        .range(f, t)
    ),
    pageAll<{ price_won: number | null; member_id: number | null; item_name: string | null; memo: string | null }>(
      (f, t) =>
        supabase
          .from("crm_rentals")
          .select("price_won, member_id, item_name, memo")
          .eq("center_id", centerId)
          .gte("start_date", from)
          .lt("start_date", endExclYmd)
          .range(f, t)
    ),
  ]);

  const out: IssuanceSale[] = [];
  for (const m of ms) out.push({ amount_won: m.price_won ?? 0, category: "membership", member_id: m.member_id });
  for (const p of ps) out.push({ amount_won: p.price_won ?? 0, category: "lesson", member_id: p.member_id });
  for (const r of rs) {
    // 대여권은 락커/운동복이 섞여 있다 — 대시보드가 둘을 나눠 보여주므로 종류로 가른다.
    const kind = rentalKindKey(r.item_name, r.memo);
    out.push({
      amount_won: r.price_won ?? 0,
      category: kind === "locker" ? "locker" : "rental",
      member_id: r.member_id,
    });
  }
  return out;
}

export interface RefundSale {
  /** 음수(환불액) */
  amount_won: number;
  category: SalesCategory;
  member_id: number | null;
  /** 원결제 수단 (cash/card/transfer/etc) — 결제수단별 매출에서도 빼기 위해 */
  method: string | null;
  refunded_at: string;
}

/**
 * [startYmd, endExclYmd) 에 **환불된 금액**(환불한 달 기준, 음수).
 * 결제월 매출은 그대로 두고 환불한 달에 마이너스로 반영한다.
 *
 * BROJ 원장(crm_sales)에는 이관분 환불이 이미 음수로 들어 있으므로,
 * 원장 컷오프 이후 구간만 집계해 이중 차감을 막는다.
 */
export async function fetchRefundSales(
  centerId: number,
  startYmd: string,
  endExclYmd: string
): Promise<RefundSale[]> {
  const cutoff = await salesCutoffYmd(centerId);
  const from = cutoff && nextYmd(cutoff) > startYmd ? nextYmd(cutoff) : startYmd;
  if (from >= endExclYmd) return [];

  const refunds = await pageAll<{
    amount_won: number | null;
    member_id: number | null;
    payment_id: number | null;
    refunded_at: string;
  }>((f, t) =>
    supabase
      .from("crm_payment_refunds")
      .select("amount_won, member_id, payment_id, refunded_at")
      .eq("center_id", centerId)
      .gte("refunded_at", `${from}T00:00:00+09:00`)
      .lt("refunded_at", `${endExclYmd}T00:00:00+09:00`)
      .range(f, t)
  );
  if (refunds.length === 0) return [];

  // 카테고리·결제수단은 원결제행에서 가져온다 (상품 연결이 끊긴 과거 건은 상품명으로 추정)
  const payIds = Array.from(new Set(refunds.map((r) => r.payment_id).filter((v): v is number => !!v)));
  type PayInfo = {
    id: number;
    method: string | null;
    membership_id: number | null;
    pass_id: number | null;
    rental_id: number | null;
    product_label: string | null;
  };
  const payById = new Map<number, PayInfo>();
  for (let i = 0; i < payIds.length; i += 500) {
    const { data } = await supabase
      .from("crm_payments")
      .select("id, method, membership_id, pass_id, rental_id, product_label")
      .eq("center_id", centerId)
      .in("id", payIds.slice(i, i + 500));
    for (const p of (data ?? []) as PayInfo[]) payById.set(Number(p.id), p);
  }

  // 대여권은 락커/운동복을 갈라야 한다 — 연결이 남아 있으면 실물에서, 없으면 상품명에서.
  const rentalIds = Array.from(
    new Set(Array.from(payById.values()).map((p) => p.rental_id).filter((v): v is number => !!v))
  );
  const rentalById = new Map<number, { item_name: string | null; memo: string | null }>();
  for (let i = 0; i < rentalIds.length; i += 500) {
    const { data } = await supabase
      .from("crm_rentals")
      .select("id, item_name, memo")
      .eq("center_id", centerId)
      .in("id", rentalIds.slice(i, i + 500));
    for (const r of (data ?? []) as { id: number; item_name: string | null; memo: string | null }[]) {
      rentalById.set(Number(r.id), { item_name: r.item_name, memo: r.memo });
    }
  }

  const categoryOf = (p: PayInfo): SalesCategory | null => {
    if (p.membership_id) return "membership";
    if (p.pass_id) return "lesson";
    if (p.rental_id) {
      const r = rentalById.get(p.rental_id);
      return rentalKindKey(r?.item_name ?? p.product_label ?? null, r?.memo ?? null) === "locker"
        ? "locker"
        : "rental";
    }
    return null;
  };

  const out: RefundSale[] = [];
  for (const r of refunds) {
    const p = r.payment_id ? payById.get(r.payment_id) : undefined;
    if (!p) continue;
    const category = categoryOf(p);
    // 🚨 상품 연결이 끊긴 환불(2026-09-26 이전 방식 = 환불 시 상품을 삭제) 은 건너뛴다.
    //    그 건은 발급 레코드가 사라져 **원매출이 이미 매출에서 빠졌다** — 또 빼면 이중 차감.
    if (!category) continue;
    out.push({
      amount_won: -Math.abs(r.amount_won ?? 0),
      category,
      member_id: r.member_id,
      method: p.method ?? null,
      refunded_at: r.refunded_at,
    });
  }
  return out;
}
