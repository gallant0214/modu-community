/**
 * 주문 완결 처리 — 결제가 확정된 뒤 실제로 "받을 것을 받게" 하는 단계.
 *
 * 두 경로가 이 함수 하나를 쓴다:
 *   · PG 승인 성공 후            (orders/confirm)
 *   · 0원 주문(증정 쿠폰·마일리지 전액)  (orders 생성 시 즉시)
 * 두 곳에 같은 절차를 복붙하면 한쪽만 고쳐지는 사고가 난다.
 *
 * 순서가 안전의 전부다:
 *   1) 상품 발급        — 실패하면 여기서 멈춘다
 *   2) 마일리지 정산    — 사용 차감 + 구매 적립, 원장까지
 *   3) 결제 원장 기록
 *   4) 쿠폰을 이 주문에 확정 연결
 *   5) 주문 상태 갱신
 *   6) 알림 (실패해도 결제·발급에는 영향 없음)
 */
import { supabase } from "@/app/lib/supabase";
import {
  PRODUCT_SELECT,
  fulfillPurchase,
  recordPayment,
  type SellableProduct,
} from "@/app/lib/member-purchase";
import { settleOrderMileage } from "@/app/lib/member-checkout";
import { finalizeCouponUse, releaseCoupon } from "@/app/lib/crm-coupons-server";
import { sendLocalizedPushToMember } from "@/app/lib/member-notify";
import { notifyCenterStaffSignupPurchase } from "@/app/lib/crm-staff-notify";

export interface OrderRow {
  id: number;
  center_id: number;
  member_id: number;
  product_id: number | null;
  product_name: string;
  amount_won: number;
  list_price_won: number;
  coupon_issue_id: number | null;
  coupon_discount_won: number;
  mileage_used: number;
  mileage_earned: number;
  channel: string;
  status: string;
}

export interface PgResult {
  paymentKey?: string;
  approvedAt?: string;
  method?: string;
  receiptUrl?: string;
  raw?: unknown;
}

export type CompleteResult =
  | { ok: true; issued: { kind: string; id: number; summary?: Record<string, unknown> }; receiptUrl?: string }
  | { ok: false; error: string; status: number };

export async function completeOrder(opts: {
  order: OrderRow;
  memberName: string;
  /** PG 를 거친 주문이면 승인 결과. 0원 주문이면 없음 */
  pg?: PgResult;
}): Promise<CompleteResult> {
  const { order, pg } = opts;
  const centerId = order.center_id;
  const memberId = order.member_id;
  const paidViaPg = !!pg;

  const pgFields = pg
    ? {
        pg_payment_key: pg.paymentKey ?? null,
        pg_approved_at: pg.approvedAt ?? null,
        pg_method: pg.method ?? null,
        pg_receipt_url: pg.receiptUrl ?? null,
        pg_raw: (pg.raw ?? null) as never,
      }
    : {};

  /* ── 1) 상품 조회 ─────────────────────────────────────── */
  const { data: pData } = await supabase
    .from("crm_products")
    .select(PRODUCT_SELECT)
    .eq("id", order.product_id ?? 0)
    .maybeSingle();
  const product = pData as unknown as SellableProduct | null;

  if (!product) {
    return failOrder(order, pgFields, paidViaPg, "상품 정보를 찾을 수 없어 발급 보류");
  }

  /* ── 2) 발급 ─────────────────────────────────────────── */
  let issued;
  try {
    issued = await fulfillPurchase({
      centerId,
      memberId,
      product,
      amountWon: order.amount_won,
      discountWon: order.coupon_discount_won ?? 0,
      mileageUsed: order.mileage_used ?? 0,
      mileageEarn: order.mileage_earned ?? 0,
      pgMethod: pg?.method ?? (order.amount_won === 0 ? "쿠폰·마일리지" : null),
      channel: order.channel,
    });
  } catch (e) {
    return failOrder(
      order,
      pgFields,
      paidViaPg,
      `발급 실패: ${e instanceof Error ? e.message : "알 수 없음"}`
    );
  }

  /* ── 3) 마일리지 정산 (사용 차감 + 구매 적립, 원장 포함) ── */
  await settleOrderMileage({
    centerId,
    memberId,
    earned: order.mileage_earned ?? 0,
    used: order.mileage_used ?? 0,
  });

  /* ── 4) 결제 원장 ────────────────────────────────────── */
  const channelLabel = order.channel === "web" ? "홈페이지 구매" : "회원앱 구매";
  const paymentId = await recordPayment({
    centerId,
    memberId,
    orderId: order.id,
    amountWon: order.amount_won,
    outcome: issued,
    note: `${channelLabel} · ${order.product_name}`,
  });

  /* ── 5) 쿠폰 확정 연결 ───────────────────────────────── */
  if (order.coupon_issue_id) {
    await finalizeCouponUse(order.coupon_issue_id, "order", order.id);
  }

  /* ── 6) 주문 갱신 ────────────────────────────────────── */
  await supabase
    .from("crm_orders")
    .update({
      status: "paid",
      ...pgFields,
      issued_kind: issued.kind,
      issued_id: issued.id,
      issued_extra: (issued.extra ?? null) as never,
      payment_id: paymentId,
      fail_reason: null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", order.id);

  /* ── 7) 알림 ─────────────────────────────────────────── */
  try {
    await sendLocalizedPushToMember(
      memberId,
      "purchase_done",
      "purchaseDone",
      { product: order.product_name },
      {}
    );
  } catch {
    /* 알림 실패는 무시 — 결제·발급은 이미 끝났다 */
  }
  try {
    await notifyCenterStaffSignupPurchase({
      centerId,
      kind: "purchase",
      memberId,
      memberName: opts.memberName,
      productName: order.product_name,
      amountWon: order.amount_won,
    });
  } catch {
    /* 무시 */
  }

  return {
    ok: true,
    issued: { kind: issued.kind, id: issued.id, summary: issued.summary as unknown as Record<string, unknown> },
    receiptUrl: pg?.receiptUrl,
  };
}

/**
 * 발급이 안 된 경우의 뒷정리.
 *  · PG 결제를 거쳤으면 돈은 이미 받았다 → status=paid 로 두고 fail_reason 을 남겨 직원이 수동 처리
 *  · 0원 주문이면 받은 돈이 없다 → failed 로 되돌리고 쿠폰도 풀어준다
 */
async function failOrder(
  order: OrderRow,
  pgFields: Record<string, unknown>,
  paidViaPg: boolean,
  reason: string
): Promise<CompleteResult> {
  await supabase
    .from("crm_orders")
    .update({
      status: paidViaPg ? "paid" : "failed",
      ...pgFields,
      fail_reason: reason,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", order.id);

  if (!paidViaPg && order.coupon_issue_id) {
    await releaseCoupon(order.coupon_issue_id);
  }

  return {
    ok: false,
    status: 500,
    error: paidViaPg
      ? "결제는 완료됐지만 상품 발급에 실패했어요. 센터에 문의해주세요."
      : "상품 발급에 실패했어요. 잠시 후 다시 시도해주세요.",
  };
}

/** 주문 조회에 쓰는 컬럼 — 발급에 필요한 것 전부 */
export const ORDER_FULL_SELECT =
  "id, center_id, member_id, product_id, product_name, amount_won, list_price_won, " +
  "coupon_issue_id, coupon_discount_won, mileage_used, mileage_earned, channel, status, " +
  "issued_kind, issued_id, pg_payment_key, pg_receipt_url";

/** 발급에 필요한 컬럼이 모두 채워진 주문 */
export interface FullOrder extends OrderRow {
  issued_kind: string | null;
  issued_id: number | null;
  pg_receipt_url: string | null;
}

export type ClaimOutcome =
  | { won: true; order: FullOrder }
  | { won: false; reason: "already_done" | "in_progress" | "not_claimable"; order: FullOrder | null };

/**
 * 발급 권한을 **원자적으로 선점**한다.
 *
 * 🚨 이게 없으면 이중 발급이 난다.
 *    2026-09-24 사고: 브라우저 승인과 웹훅이 0.03초 차로 동시에 들어와
 *    둘 다 주문을 pending 으로 읽고 각자 발급 → 회원권·결제원장이 2건씩 생겼다.
 *    "읽어서 확인하고 쓴다"는 동시 실행에 무력하다. 조건부 UPDATE 로 한쪽만 이기게 한다.
 *    (쿠폰 claimCoupon 과 같은 방식)
 *
 * @param allowStale 시한이 지나 취소된 주문도 선점 허용(웹훅의 늦은 입금 구제용)
 */
export async function claimOrderForFulfillment(
  orderId: number,
  allowStale = false
): Promise<ClaimOutcome> {
  const claimable = allowStale ? ["pending", "canceled", "failed"] : ["pending"];

  const { data: claimed } = await supabase
    .from("crm_orders")
    .update({ status: "processing", updated_at: new Date().toISOString() } as never)
    .eq("id", orderId)
    .in("status", claimable)
    .select(ORDER_FULL_SELECT);

  const won = ((claimed ?? [])[0] ?? null) as unknown as FullOrder | null;
  if (won) return { won: true, order: won };

  // 못 잡았다 — 왜인지 알려줘야 호출 측이 알맞게 응답한다
  const { data: cur } = await supabase
    .from("crm_orders")
    .select(ORDER_FULL_SELECT)
    .eq("id", orderId)
    .maybeSingle();
  const order = (cur ?? null) as unknown as FullOrder | null;
  if (!order) return { won: false, reason: "not_claimable", order: null };
  if (order.status === "paid" && order.issued_id) return { won: false, reason: "already_done", order };
  if (order.status === "processing") return { won: false, reason: "in_progress", order };
  return { won: false, reason: "not_claimable", order };
}

/** 선점만 하고 발급을 못 한 경우 — 원래 상태로 되돌린다 */
export async function releaseOrderClaim(orderId: number, backTo: string) {
  await supabase
    .from("crm_orders")
    .update({ status: backTo, updated_at: new Date().toISOString() } as never)
    .eq("id", orderId)
    .eq("status", "processing");
}
