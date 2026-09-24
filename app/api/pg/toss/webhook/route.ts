import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { fetchTossPayment, fetchTossPaymentByOrderId } from "@/app/lib/toss-payments";
import {
  completeOrder,
  claimOrderForFulfillment,
  type OrderRow,
} from "@/app/lib/member-order-complete";
import { applyPgCancel } from "@/app/lib/crm-pg-cancel";

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
    // 처리는 공용 함수가 한다 — '＄PG 상태 다시 확인'(수동)도 같은 함수를 쓴다
    const res = await applyPgCancel({ order, pay });
    return finish(res.note, res.ok && !res.needsStaff);
  }

  return finish(`처리 대상 아닌 상태 (${status})`, true);
}
