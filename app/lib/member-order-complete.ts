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
