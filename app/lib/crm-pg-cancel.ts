import "server-only";
import { supabase } from "@/app/lib/supabase";
import { retireIssuedForPayment, RETIRE_KIND_LABEL } from "@/app/lib/crm-retire-issued";
import { matchItemsByRefundAmount, syncOrderRefundState } from "@/app/lib/crm-order-refund";
import { refundOrderMileage } from "@/app/lib/member-checkout";
import { restoreCouponAfterRefund } from "@/app/lib/crm-coupons-server";

/**
 * PG(토스)에서 취소된 결제를 CRM 에 반영한다.
 *
 * 두 곳이 쓴다 — 웹훅(자동)과 '＄PG 상태 다시 확인'(수동). 같은 함수를 써야
 * 두 경로가 어긋나지 않는다. CRM 에서 직접 환불하는 길은 막아뒀기 때문에
 * (돈은 토스에 남아 장부만 어긋난다) 이 함수가 유일한 환불 경로다.
 *
 * 🚨 환불 이력·마일리지·쿠폰은 모두 **환불된 항목 기준**이다.
 *    주문 단위로 처리하면 묶음 결제에서 금액이 어긋난다.
 */
export interface PgCancelResult {
  ok: boolean;
  /** 사람이 읽을 처리 결과 */
  note: string;
  /** 항목을 특정하지 못해 이용권을 회수하지 않은 경우 */
  needsStaff: boolean;
  retired: number;
}

interface OrderForCancel {
  id: number;
  center_id: number;
  member_id: number;
  amount_won: number;
  status: string;
  coupon_issue_id: number | null;
}

export async function applyPgCancel(opts: {
  order: OrderForCancel;
  /** 토스 결제 조회 결과 (status, cancels) */
  pay: Record<string, unknown>;
}): Promise<PgCancelResult> {
  const { order, pay } = opts;
  const status = String(pay.status ?? "");
  if (status !== "CANCELED" && status !== "PARTIAL_CANCELED") {
    return { ok: false, note: `취소된 결제가 아니에요 (${status})`, needsStaff: false, retired: 0 };
  }
  if (order.status === "refunded") {
    return { ok: true, note: "이미 환불 처리됨", needsStaff: false, retired: 0 };
  }

  type TossCancel = {
    cancelAmount?: number;
    canceledAt?: string;
    cancelReason?: string;
    transactionKey?: string;
  };
  const cancels: TossCancel[] = Array.isArray(pay.cancels) ? (pay.cancels as TossCancel[]) : [];
  const canceledAmount = cancels.reduce((sum, c) => sum + Number(c.cancelAmount ?? 0), 0);
  const latest = cancels[cancels.length - 1];
  const refundedAt = latest?.canceledAt || new Date().toISOString();
  const reason = latest?.cancelReason || "PG 에서 취소됨";
  const txKey = latest?.transactionKey || null;

  await supabase
    .from("crm_orders")
    .update({ refund_reason: reason, updated_at: new Date().toISOString() } as never)
    .eq("id", order.id);

  const matched = await matchItemsByRefundAmount({
    orderId: order.id,
    amountWon: canceledAmount || order.amount_won,
  });

  /* 항목을 특정 못 했다 — 사실만 기록하고 이용권은 그대로 둔다.
     엉뚱한 이용권을 회수하는 것보다 직원이 보는 게 낫다. */
  if (matched.itemIds.length === 0) {
    const { error } = await supabase.from("crm_payment_refunds").insert({
      center_id: order.center_id,
      member_id: order.member_id,
      order_id: order.id,
      amount_won: canceledAmount || order.amount_won,
      refunded_at: refundedAt,
      source: "pg",
      provider: "toss",
      is_partial: status !== "CANCELED",
      reason,
      pg_transaction_key: txKey,
    } as never);
    if (error && !String(error.message).includes("duplicate")) {
      return { ok: false, note: `환불 이력 기록 실패: ${error.message}`, needsStaff: true, retired: 0 };
    }
    await syncOrderRefundState(order.id, refundedAt);
    return {
      ok: true,
      needsStaff: true,
      retired: 0,
      note: "환불 처리 — 어느 항목이 취소됐는지 금액으로 특정할 수 없어 이용권을 회수하지 않음. 직원 확인 필요",
    };
  }

  const notes: string[] = [];
  let refundedMileageUsed = 0;
  let refundedMileageEarned = 0;
  let retired = 0;

  for (const itemId of matched.itemIds) {
    const { data: itRow } = await supabase
      .from("crm_order_items")
      .select("id, payment_id, amount_won, product_name, mileage_used, mileage_earned, refunded_at")
      .eq("id", itemId)
      .maybeSingle();
    const it = itRow as {
      id: number;
      payment_id: number | null;
      amount_won: number;
      product_name: string;
      mileage_used: number | null;
      mileage_earned: number | null;
      refunded_at: string | null;
    } | null;
    if (!it || it.refunded_at) continue;

    // 멱등 키에 항목 id 를 붙여 항목마다 한 번만 들어가게 한다
    const { error: refErr } = await supabase.from("crm_payment_refunds").insert({
      center_id: order.center_id,
      member_id: order.member_id,
      payment_id: it.payment_id,
      order_id: order.id,
      amount_won: it.amount_won,
      refunded_at: refundedAt,
      source: "pg",
      provider: "toss",
      is_partial: status !== "CANCELED",
      reason,
      pg_transaction_key: txKey ? `${txKey}:${it.id}` : null,
    } as never);
    if (refErr && !String(refErr.message).includes("duplicate")) {
      notes.push(`'${it.product_name}' 환불 이력 기록 실패(${refErr.message})`);
      continue;
    }

    await supabase
      .from("crm_order_items")
      .update({ refunded_at: refundedAt, refund_amount: it.amount_won, updated_at: refundedAt } as never)
      .eq("id", it.id);

    refundedMileageUsed += Math.max(0, it.mileage_used ?? 0);
    refundedMileageEarned += Math.max(0, it.mileage_earned ?? 0);

    if (!it.payment_id) continue;
    await supabase
      .from("crm_payments")
      .update({ status: "refunded", updated_at: refundedAt } as never)
      .eq("id", it.payment_id);

    const r = await retireIssuedForPayment({ centerId: order.center_id, paymentId: it.payment_id });
    if (!r.ok) {
      notes.push(`'${it.product_name}' 이용권 회수 실패(${r.error ?? "알 수 없음"}) — 직원 확인 필요`);
      continue;
    }
    if (!r.kind) continue;
    retired += 1;
    notes.push(`${RETIRE_KIND_LABEL[r.kind] ?? r.kind} '${r.label ?? ""}' 회수`);
    await supabase.from("crm_audit_logs").insert({
      center_id: order.center_id,
      actor_uid: "system:toss-webhook",
      action: "payment.refund_pg",
      entity_type: "crm_payments",
      entity_id: it.payment_id,
      payload: {
        member_id: order.member_id,
        환불금액: it.amount_won,
        회수항목: RETIRE_KIND_LABEL[r.kind] ?? r.kind,
        상품명: r.label,
        처리경로: "PG(토스)에서 결제 취소 — 대금이 회원에게 반환됨",
        ...(r.locker ? { 락커: `반납 ${r.locker.returned}건 · 기간원복 ${r.locker.reverted}건` } : {}),
      } as never,
    });
  }

  // 마일리지는 환불된 항목 몫만 되돌린다
  await refundOrderMileage({
    centerId: order.center_id,
    memberId: order.member_id,
    used: refundedMileageUsed,
    earned: refundedMileageEarned,
  });

  const state = await syncOrderRefundState(order.id, refundedAt);

  // 쿠폰은 전부 환불됐을 때만 — 살아있는 항목이 이미 할인을 받았다
  if (state.allRefunded && order.coupon_issue_id) {
    await restoreCouponAfterRefund(order.coupon_issue_id);
  }

  return {
    ok: true,
    needsStaff: notes.some((n) => n.includes("확인 필요")),
    retired,
    note: `환불 처리 완료${notes.length ? " · " + notes.join(" · ") : ""}`,
  };
}
