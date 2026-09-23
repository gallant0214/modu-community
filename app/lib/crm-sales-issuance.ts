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
