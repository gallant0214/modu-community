import { supabase } from "./supabase";

export type ProductLink = "pass_id" | "membership_id" | "rental_id";

export type PaymentSyncReason =
  | "same_price"
  | "same_date"
  | "no_payment"
  | "multiple_payments"
  | "amount_mismatch"
  | "error";

export interface PaymentSyncResult {
  synced: boolean;
  paymentId?: number;
  reason?: PaymentSyncReason;
}

/**
 * 상품(수강권/회원권/대여권) 가격을 수정했을 때 연결된 결제내역 금액을 맞춰준다.
 *
 * 🚨 규칙 (2026-09-22 사용자 확정) — **단일 전액 결제만 자동 반영**:
 *  - 그 상품에 연결된 completed 결제행이 정확히 1건이고, 금액이 '수정 전 가격'과 같을 때만 새 가격으로 바꾼다.
 *    (= 정가를 한 번에 받은 건. 이 경우 가격 수정 의도는 곧 결제액 수정 의도다)
 *  - 결제행 2건 이상(분할 결제)이나 금액이 가격과 다른 건(부분 입금/미수금)은 **건드리지 않는다** —
 *    언제 얼마를 받았는지 기록이 사라지기 때문.
 *  - 결제행이 없는 건(이관 데이터 등)도 새로 만들지 않는다.
 *
 * price_won 은 이미 할인 후 실결제액이라 결제행 금액과 같은 기준이다(발급 시 amount_won = price_won).
 */
export async function syncProductPaymentAmount(opts: {
  centerId: number;
  actorUid: string;
  link: ProductLink;
  productId: number;
  oldPrice: number;
  newPrice: number;
}): Promise<PaymentSyncResult> {
  const { centerId, actorUid, link, productId, oldPrice, newPrice } = opts;
  if (!Number.isFinite(oldPrice) || !Number.isFinite(newPrice)) {
    return { synced: false, reason: "error" };
  }
  if (oldPrice === newPrice) return { synced: false, reason: "same_price" };

  const { data: rows, error } = await supabase
    .from("crm_payments")
    .select("id, amount_won")
    .eq("center_id", centerId)
    .eq(link, productId)
    .eq("status", "completed");
  if (error) return { synced: false, reason: "error" };

  const list = rows ?? [];
  if (list.length === 0) return { synced: false, reason: "no_payment" };
  if (list.length > 1) return { synced: false, reason: "multiple_payments" };

  const row = list[0];
  if ((row.amount_won ?? 0) !== oldPrice) return { synced: false, reason: "amount_mismatch" };

  const { error: upErr } = await supabase
    .from("crm_payments")
    .update({ amount_won: newPrice, updated_at: new Date().toISOString() } as never)
    .eq("id", row.id)
    .eq("center_id", centerId);
  if (upErr) return { synced: false, reason: "error" };

  await supabase.from("crm_audit_logs").insert({
    center_id: centerId,
    actor_uid: actorUid,
    action: "payment.update",
    entity_type: "crm_payments",
    entity_id: row.id,
    payload: {
      amount_won: newPrice,
      before_amount_won: oldPrice,
      source: "product_price_sync",
      [link]: productId,
    } as never,
  });

  return { synced: true, paymentId: row.id };
}

/**
 * 상품의 '결제일' 을 바꿨을 때 연결된 결제내역의 paid_at 을 맞춘다.
 *
 * - 동기화 범위는 금액과 동일: **완료 결제행이 정확히 1건일 때만**(분할 결제는 건드리지 않음).
 * - 날짜만 바꾸고 **시각은 유지**한다 — 당일 결제의 실제 시각과 이관분 00:00 을 보존하기 위함.
 *   (crm_rentals 는 구매일 컬럼이 없어 결제일의 단일 원본이 crm_payments.paid_at 이다)
 */
export async function syncProductPaymentDate(opts: {
  centerId: number;
  actorUid: string;
  link: ProductLink;
  productId: number;
  paidYmd: string;
}): Promise<PaymentSyncResult> {
  const { centerId, actorUid, link, productId, paidYmd } = opts;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidYmd)) return { synced: false, reason: "error" };

  const { data: rows, error } = await supabase
    .from("crm_payments")
    .select("id, paid_at")
    .eq("center_id", centerId)
    .eq(link, productId)
    .eq("status", "completed");
  if (error) return { synced: false, reason: "error" };

  const list = rows ?? [];
  if (list.length === 0) return { synced: false, reason: "no_payment" };
  if (list.length > 1) return { synced: false, reason: "multiple_payments" };

  const row = list[0];
  const kstIso = new Date(new Date(row.paid_at as string).getTime() + 9 * 3600 * 1000).toISOString();
  if (kstIso.slice(0, 10) === paidYmd) return { synced: false, reason: "same_date" };
  const nextIso = new Date(`${paidYmd}T${kstIso.slice(11, 19)}+09:00`).toISOString();

  const { error: upErr } = await supabase
    .from("crm_payments")
    .update({ paid_at: nextIso, updated_at: new Date().toISOString() } as never)
    .eq("id", row.id)
    .eq("center_id", centerId);
  if (upErr) return { synced: false, reason: "error" };

  await supabase.from("crm_audit_logs").insert({
    center_id: centerId,
    actor_uid: actorUid,
    action: "payment.update",
    entity_type: "crm_payments",
    entity_id: row.id,
    payload: {
      paid_at: nextIso,
      before_paid_at: row.paid_at,
      source: "product_paid_date_sync",
      [link]: productId,
    } as never,
  });

  return { synced: true, paymentId: row.id };
}
