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
 * 🚨 규칙 — **결제행이 1건일 때만** 자동 반영:
 *  - 2026-09-22: 금액이 '수정 전 가격'과 같을 때만 새 가격으로 교체(단일 전액 결제).
 *  - 2026-10-12 보완: 마일리지를 쓰거나 미수금이 있으면 결제액 ≠ 가격이라 위 조건에서 빠져
 *    가격을 고쳐도 결제내역이 그대로였다(장현지 회원: 가격 424,000 · 마일리지 10,000 사용 →
 *    결제 414,000. 가격을 480,000 으로 고쳐도 결제는 414,000 유지).
 *    → 금액이 가격과 다르면 **가격 변동폭(Δ)만큼 결제액을 옮긴다**(414,000 + 56,000 = 470,000).
 *      마일리지·미수금 차액이 보존되고, 실제로 받은 금액이 가격보다 커지지 않는다.
 *  - 결제행 2건 이상(분할 결제)은 어느 건을 고칠지 알 수 없어 **건드리지 않는다**.
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
  const curAmount = row.amount_won ?? 0;
  // 전액 결제면 새 가격으로, 아니면(마일리지 사용·부분 입금) 변동폭만큼 이동
  const nextAmount =
    curAmount === oldPrice ? newPrice : Math.max(0, curAmount + (newPrice - oldPrice));
  if (nextAmount === curAmount) return { synced: false, reason: "amount_mismatch" };

  const { error: upErr } = await supabase
    .from("crm_payments")
    .update({ amount_won: nextAmount, updated_at: new Date().toISOString() } as never)
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
      amount_won: nextAmount,
      before_amount_won: curAmount,
      price_before: oldPrice,
      price_after: newPrice,
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
