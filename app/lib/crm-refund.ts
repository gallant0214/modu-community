import { supabase } from "@/app/lib/supabase";
import { restoreCouponAfterRefund, findCouponIssueForPayment } from "@/app/lib/crm-coupons-server";
import { markOrderItemRefunded } from "@/app/lib/crm-order-refund";

/**
 * 환불 기록 공용 로직 — 결제내역 탭과 상품 상세(회원권·수강권·대여권)가 같은 원장을 남긴다.
 *
 * 원칙
 *  - 환불하면 상품은 회수(status='refunded')하고, **실제로 돌려준 금액**을 `crm_payment_refunds` 에 남긴다.
 *  - 돌려준 금액이 결제액보다 적으면 `is_partial=true`(부분 환불).
 *  - 결제행(`crm_payments.amount_won`)은 손대지 않는다 — 결제한 사실과 환불한 사실을 둘 다 남기는 게 원장이다.
 */

export type ProductKind = "membership" | "pass" | "rental";

const PRODUCT_FK: Record<ProductKind, string> = {
  membership: "membership_id",
  pass: "pass_id",
  rental: "rental_id",
};

/** 상품에 달린 결제행(가장 최근 유효 건) */
export async function findProductPayment(
  centerId: number,
  kind: ProductKind,
  productId: number
): Promise<{ id: number; member_id: number; amount_won: number; status: string; order_id: number | null } | null> {
  const { data } = await supabase
    .from("crm_payments")
    .select("id, member_id, amount_won, status, order_id")
    .eq("center_id", centerId)
    .eq(PRODUCT_FK[kind], productId)
    .order("paid_at", { ascending: false })
    .limit(1);
  return (data?.[0] as { id: number; member_id: number; amount_won: number; status: string; order_id: number | null } | undefined) ?? null;
}

/** 요청 본문에서 환불 금액을 읽는다. 값이 없으면 전액(paidWon). */
export function parseRefundWon(raw: unknown, paidWon: number): { won: number } | { error: string } {
  if (raw === undefined || raw === null || raw === "") return { won: Math.max(0, paidWon) };
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n) || n < 0) return { error: "환불 금액이 올바르지 않아요" };
  if (n > Math.max(0, paidWon)) {
    return { error: `결제 금액(${Math.max(0, paidWon).toLocaleString()}원)보다 많이 환불할 수 없어요` };
  }
  return { won: n };
}

/**
 * DELETE 요청에 실려 온 환불 정보.
 * 본문(JSON) 우선, 없으면 쿼리스트링(?refund_won=&reason=) — 중간 프록시가 DELETE 본문을
 * 떨어뜨려도 금액이 전액으로 둔갑하지 않게 두 경로를 모두 읽는다.
 */
export async function readRefundBody(request: Request): Promise<{ refund_won?: unknown; reason?: string | null }> {
  try {
    const b = (await request.json()) as { refund_won?: unknown; reason?: string | null } | null;
    if (b && b.refund_won !== undefined) return b;
  } catch {
    // 본문 없음 — 쿼리로 넘어간다
  }
  const q = new URL(request.url).searchParams;
  const won = q.get("refund_won");
  return {
    refund_won: won === null ? undefined : won,
    reason: q.get("reason"),
  };
}

/**
 * 환불 이력 INSERT + 결제행 상태 갱신 + 쿠폰 복원 + 묶음 주문 표시.
 * 결제행이 없으면(0원 발급·이관분) 이력만 남긴다.
 */
export async function recordRefund(opts: {
  centerId: number;
  memberId: number;
  actorUid: string;
  refundWon: number;
  paidWon: number;
  reason?: string | null;
  payment?: { id: number; order_id: number | null; status: string } | null;
  /** 쿠폰 복원 판정용 — 어떤 상품을 환불했는지 */
  product?: { kind: ProductKind; id: number };
}): Promise<{ error?: string }> {
  const { centerId, memberId, actorUid, refundWon, paidWon, reason, payment, product } = opts;

  const { error } = await supabase.from("crm_payment_refunds").insert({
    center_id: centerId,
    member_id: memberId,
    payment_id: payment?.id ?? null,
    order_id: payment?.order_id ?? null,
    amount_won: refundWon,
    source: "center",
    is_partial: refundWon < Math.max(0, paidWon),
    reason: (reason ?? "")?.toString().trim() || null,
    actor_uid: actorUid,
  } as never);
  if (error) return { error: error.message };

  if (payment && payment.status !== "refunded") {
    await supabase
      .from("crm_payments")
      .update({ status: "refunded" } as never)
      .eq("id", payment.id)
      .eq("center_id", centerId);
  }

  if (payment) {
    // 이 결제에 쓴 쿠폰은 회원에게 돌려준다 (결제내역 탭 환불과 같은 처리)
    if (product) {
      const issueId = await findCouponIssueForPayment({
        centerId,
        orderId: payment.order_id,
        productKind: product.kind,
        productId: product.id,
      });
      if (issueId) await restoreCouponAfterRefund(issueId);
    }
    // 묶음(주문) 결제면 이 항목만 환불로 표시하고, 전부 환불되면 주문도 환불로 바뀐다
    await markOrderItemRefunded({ centerId, paymentId: payment.id, amountWon: refundWon });
  }
  return {};
}
