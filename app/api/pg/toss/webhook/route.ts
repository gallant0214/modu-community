import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { fetchTossPayment, fetchTossPaymentByOrderId } from "@/app/lib/toss-payments";
import {
  completeOrder,
  claimOrderForFulfillment,
  type OrderRow,
} from "@/app/lib/member-order-complete";
import { refundOrderMileage } from "@/app/lib/member-checkout";
import { restoreCouponAfterRefund } from "@/app/lib/crm-coupons-server";
import { retireIssuedForPayment, RETIRE_KIND_LABEL } from "@/app/lib/crm-retire-issued";
import { matchItemsByRefundAmount, syncOrderRefundState } from "@/app/lib/crm-order-refund";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ORDER_SELECT =
  "id, center_id, member_id, product_id, product_name, amount_won, list_price_won, " +
  "coupon_issue_id, coupon_discount_won, mileage_used, mileage_earned, channel, status, " +
  "issued_kind, issued_id, pg_payment_key, payment_id";

/**
 * POST /api/pg/toss/webhook — 토스페이먼츠 결제 상태 알림.
 *
 * 이게 왜 필요한가:
 *   회원이 카드 인증까지 마치고 **앱을 꺼버리면** 우리 승인(confirm)이 호출되지 않는다.
 *   그 상태로 토스에서 결제가 완료되면 "돈은 나갔는데 이용권이 없는" 회원이 생긴다.
 *   웹훅이 그걸 뒤늦게라도 잡아 발급해 준다. 취소·환불도 여기로 들어온다.
 *
 * 🚨 웹훅 본문은 믿지 않는다.
 *   토스 웹훅에는 서명이 없어서 누구나 흉내 낼 수 있다.
 *   주문번호만 꺼내 **토스 서버에 직접 물어본 결과**로만 판단한다.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const data = (body.data ?? body) as Record<string, unknown>;
  const orderUid = String(data.orderId ?? "").trim();
  const eventType = String(body.eventType ?? data.status ?? "");

  // 무슨 일이 있었는지 먼저 남긴다 — 나중에 사고를 되짚을 유일한 근거
  const { data: logRow } = await supabase
    .from("crm_pg_webhook_logs")
    .insert({
      provider: "toss",
      event_type: eventType || null,
      payment_key: String(data.paymentKey ?? "") || null,
      order_uid: orderUid || null,
      raw: body as never,
    } as never)
    .select("id")
    .single();
  const logId = (logRow as { id: number } | null)?.id ?? null;

  const finish = async (note: string, handled: boolean) => {
    if (logId) {
      await supabase
        .from("crm_pg_webhook_logs")
        .update({ handled, note } as never)
        .eq("id", logId);
    }
    // 토스가 재시도하지 않도록 항상 200 으로 답한다(내용은 note 에 남긴다)
    return NextResponse.json({ ok: true, note });
  };

  if (!orderUid) return finish("주문번호 없음", false);

  const { data: orderRow } = await supabase
    .from("crm_orders")
    .select(ORDER_SELECT)
    .eq("order_uid", orderUid)
    .maybeSingle();
  const order = orderRow as unknown as
    | (OrderRow & {
        issued_kind: string | null;
        issued_id: number | null;
        pg_payment_key: string | null;
        payment_id: number | null;
      })
    | null;
  if (!order) return finish("우리 주문이 아님", false);

  /* ── 토스에 직접 확인 ───────────────────────────────
     🚨 paymentKey 조회를 먼저 쓴다.
        주문번호 조회(/v1/payments/orders/{orderId})는 **결제위젯 키로는 동작하지 않는다**
        (NOT_FOUND_MERCHANT). 토스 공개 문서 키로도 같아서 우리 상점 문제가 아니다.
        paymentKey 가 없을 때만 주문번호 조회를 마지막 수단으로 쓴다.               */
  const webhookPaymentKey = String(data.paymentKey ?? "").trim();
  const knownPaymentKey = webhookPaymentKey || order.pg_payment_key || "";

  const look = knownPaymentKey
    ? await fetchTossPayment(knownPaymentKey)
    : await fetchTossPaymentByOrderId(orderUid);
  if (!look.ok || !look.json) {
    return finish(`토스 조회 실패: ${look.error ?? "알 수 없음"}`, false);
  }
  const pay = look.json;
  // paymentKey 로 조회했을 수 있으니, 돌아온 결제가 정말 이 주문인지 대조한다
  if (String(pay.orderId ?? "") !== orderUid) {
    return finish(`주문번호 불일치 (토스 ${String(pay.orderId ?? "")})`, false);
  }
  const status = String(pay.status ?? "");
  const approvedAmount = Number(pay.totalAmount ?? 0);

  /* ── 결제 완료인데 아직 발급 전 → 구제 발급 ───────── */
  if (status === "DONE") {
    if (order.status === "paid" && order.issued_id) {
      return finish("이미 처리된 주문", true);
    }
    if (approvedAmount !== order.amount_won) {
      // 금액이 다르면 손대지 않는다 — 사람이 봐야 하는 상황
      return finish(`금액 불일치 (토스 ${approvedAmount} / 주문 ${order.amount_won})`, false);
    }
    /**
     * 🚨 시한이 지나 취소된 주문이라도 **토스가 DONE 이라면 발급한다.**
     *    가상계좌처럼 입금이 나중에 들어오는 수단은 주문 시한(30분)을 넘기기 쉽고,
     *    그때 막아버리면 "돈은 들어왔는데 이용권이 없는" 회원이 생긴다.
     *    돈이 실제로 들어온 쪽을 언제나 우선한다.
     */
    if (!["pending", "canceled", "failed"].includes(order.status)) {
      // processing = 브라우저 승인이 지금 처리 중. 양보하는 게 정상 동작이라 실패로 남기지 않는다
      const normal = order.status === "processing" || order.status === "paid";
      return finish(
        normal
          ? `브라우저 승인이 처리 중이라 양보 (status=${order.status})`
          : `발급 대상 아님 (status=${order.status})`,
        normal
      );
    }
    if (order.status !== "pending" && order.coupon_issue_id) {
      // 시한 초과로 풀어줬던 쿠폰을 다시 사용 처리 — 이 주문이 그 할인으로 결제됐으므로
      await supabase
        .from("crm_coupon_issues")
        .update({ status: "used", used_at: new Date().toISOString() } as never)
        .eq("id", order.coupon_issue_id)
        .eq("status", "issued");
    }

    /* 🚨 브라우저 승인이 같은 주문을 동시에 발급할 수 있다. 한쪽만 이기게 한다.
          (2026-09-24 이중 발급 사고) */
    const claim = await claimOrderForFulfillment(order.id, true);
    if (!claim.won) {
      return finish(
        claim.reason === "already_done" ? "이미 발급됨(중복 방지)" : "다른 요청이 처리 중",
        true
      );
    }

    const { data: mem } = await supabase
      .from("crm_members")
      .select("name")
      .eq("id", order.member_id)
      .maybeSingle();

    const done = await completeOrder({
      order: claim.order,
      memberName: (mem as { name?: string } | null)?.name ?? "",
      pg: {
        paymentKey: String(pay.paymentKey ?? ""),
        approvedAt: String(pay.approvedAt ?? ""),
        method: String(pay.method ?? ""),
        receiptUrl: String((pay.receipt as Record<string, unknown> | undefined)?.url ?? ""),
        raw: pay,
      },
    });
    return finish(done.ok ? "웹훅으로 구제 발급 완료" : `구제 발급 실패: ${done.error}`, done.ok);
  }

  /* ── 토스 쪽에서 취소됨 ──────────────────────────── */
  if (status === "CANCELED" || status === "PARTIAL_CANCELED") {
    if (order.status === "refunded") return finish("이미 환불 처리됨", true);

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
    /** 멱등 키 — 같은 취소가 여러 번 와도 항목마다 한 번만 기록된다 */
    const txKey = latest?.transactionKey || null;

    await supabase
      .from("crm_orders")
      .update({ refund_reason: reason, updated_at: new Date().toISOString() } as never)
      .eq("id", order.id);

    /* 🚨 취소된 금액에 해당하는 **항목**을 찾는다.
          묶음 결제는 항목마다 금액이 다르므로, 환불 이력도 항목별로 남겨야 한다.
          주문 단위로 한 건만 남기면 모든 항목에 같은 금액이 붙어 버린다.
          애매하면 손대지 않고 직원이 보게 남긴다 — 엉뚱한 이용권을 회수하는 것보다 낫다. */
    const matched = await matchItemsByRefundAmount({
      orderId: order.id,
      amountWon: canceledAmount || order.amount_won,
    });

    const notes: string[] = [];
    let refundedMileageUsed = 0;
    let refundedMileageEarned = 0;

    if (matched.itemIds.length === 0) {
      // 항목을 특정 못 했다 — 사실만 기록하고 이용권은 그대로 둔다
      const { error: refErr } = await supabase.from("crm_payment_refunds").insert({
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
      if (refErr && !String(refErr.message).includes("duplicate")) {
        return finish(`환불 이력 기록 실패: ${refErr.message}`, false);
      }
      await syncOrderRefundState(order.id, refundedAt);
      return finish(
        "환불 처리 — 어느 항목이 취소됐는지 금액으로 특정할 수 없어 이용권을 회수하지 않음. 직원 확인 필요",
        false
      );
    }

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

      /* 항목별 환불 이력 — 금액은 **그 항목의 금액**이다.
         멱등 키에 항목 id 를 붙여, 웹훅이 여러 번 와도 항목마다 한 번만 들어간다. */
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

      const r = await retireIssuedForPayment({
        centerId: order.center_id,
        paymentId: it.payment_id,
      });
      if (!r.ok) {
        notes.push(`'${it.product_name}' 이용권 회수 실패(${r.error ?? "알 수 없음"}) — 직원 확인 필요`);
        continue;
      }
      if (!r.kind) continue;
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
          ...(r.locker
            ? { 락커: `반납 ${r.locker.returned}건 · 기간원복 ${r.locker.reverted}건` }
            : {}),
        } as never,
      });
    }

    /* 마일리지도 **환불된 항목 몫만** 되돌린다.
       주문 전체로 돌려주면 아직 살아있는 항목의 마일리지까지 돌려주게 된다. */
    await refundOrderMileage({
      centerId: order.center_id,
      memberId: order.member_id,
      used: refundedMileageUsed,
      earned: refundedMileageEarned,
    });

    const state = await syncOrderRefundState(order.id, refundedAt);

    /* 쿠폰은 **전부 환불됐을 때만** 돌려준다.
       일부 항목이 살아있으면 그 항목이 쿠폰 할인을 이미 받은 상태다. */
    if (state.allRefunded && order.coupon_issue_id) {
      await restoreCouponAfterRefund(order.coupon_issue_id);
    }

    return finish(`환불 처리 완료${notes.length ? " · " + notes.join(" · ") : ""}`, true);
  }

  return finish(`처리 대상 아닌 상태 (${status})`, true);
}
