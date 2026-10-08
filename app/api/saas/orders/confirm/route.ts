import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { verifyOrderToken } from "@/app/lib/order-token";
import { verifyPortonePayment } from "@/app/lib/portone-payments";
import {
  claimSaasOrder,
  completeSaasOrder,
  failSaasOrder,
  SAAS_ORDER_SELECT,
  type SaasOrderRow,
} from "@/app/lib/saas-order-complete";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/saas/orders/confirm  { orderUid, impUid, token }
 *
 * CRM 이용권 결제 **검증** → 구독 생성/연장.
 *
 * 🚨 포트원은 결제창에서 **이미 승인이 끝난** 뒤 imp_uid 를 준다. 이 라우트에
 *    들어온 시점에 **돈은 이미 빠져 있다.** 그래서 '승인' 이 아니라 '검증' 이다.
 *    - 금액·주문번호가 어긋나면 `verifyPortonePayment()` 가 즉시 취소까지 한다
 *    - 조회 자체가 실패하면 결제 성공 여부를 **모르는** 상태다. 이때 주문을 failed 로
 *      적으면, 실제로는 결제가 됐는데 뒤늦게 온 웹훅이 발급할 근거를 잃는다.
 *      → 모를 때는 주문을 건드리지 않고 503 으로 답해 웹훅에 맡긴다.
 */
export async function POST(request: Request) {
  let body: { orderUid?: string; impUid?: string; token?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const orderUid = String(body.orderUid ?? "").trim();
  const impUid = String(body.impUid ?? "").trim();
  if (!orderUid || !impUid) {
    return NextResponse.json({ error: "결제 정보가 올바르지 않아요" }, { status: 400 });
  }
  /* 결제 페이지는 로그인 세션 없이도 열릴 수 있어(앱 브라우저) 주문 토큰으로 인증한다.
     토큰은 이 주문 하나에만 유효하고, 구독은 언제나 **주문에 적힌 센터**에만 붙는다. */
  if (!verifyOrderToken(body.token, orderUid)) {
    return NextResponse.json({ error: "결제 링크가 만료됐어요" }, { status: 401 });
  }

  const { data: orderRow } = await supabase
    .from("saas_orders")
    .select(SAAS_ORDER_SELECT)
    .eq("order_uid", orderUid)
    .maybeSingle();
  const order = orderRow as unknown as SaasOrderRow | null;
  if (!order) {
    return NextResponse.json({ error: "주문을 찾을 수 없어요" }, { status: 404 });
  }

  // 이미 처리된 주문 → 그대로 성공 응답 (재시도 안전)
  if (order.status === "paid" && order.subscription_id) {
    const { data: sub } = await supabase
      .from("saas_subscriptions")
      .select("expires_on")
      .eq("id", order.subscription_id)
      .maybeSingle();
    return NextResponse.json({
      ok: true,
      alreadyDone: true,
      orderId: order.id,
      amount: order.amount_won,
      receiptUrl: order.pg_receipt_url ?? undefined,
      expiresOn: (sub as { expires_on?: string } | null)?.expires_on ?? null,
    });
  }
  if (order.status === "processing") {
    return NextResponse.json(
      { ok: true, pending: true, orderId: order.id, message: "결제를 처리하고 있어요" },
      { status: 202 }
    );
  }
  if (order.status === "refunded" || order.status === "failed") {
    return NextResponse.json({ error: "이미 종료된 주문이에요" }, { status: 409 });
  }

  /* ── 검증 — 금액은 주문에 저장된 서버 값으로 대조 ── */
  const verify = await verifyPortonePayment({
    impUid,
    orderUid,
    amountWon: order.amount_won,
  });
  if (!verify.ok) {
    if (verify.code === "LOOKUP_FAILED") {
      return NextResponse.json(
        {
          error:
            "결제 결과를 확인하지 못했어요. 결제가 되었다면 잠시 뒤 자동으로 처리됩니다. " +
            "이용권 화면에서 확인해주세요.",
        },
        { status: 503 }
      );
    }
    await failSaasOrder(order.id, verify.error ?? "검증 실패");
    return NextResponse.json({ error: verify.error ?? "결제를 확인하지 못했어요" }, { status: 402 });
  }

  /* ── 발급 권한을 원자적으로 선점 ────────────────────
     🚨 웹훅이 같은 주문을 동시에 발급할 수 있다. 조건부 UPDATE 로 한쪽만 이긴다.
        (2026-09-24 센터 이용권 이중 발급 사고와 같은 구조) */
  const claim = await claimSaasOrder(order.id);
  if (!claim.won) {
    if (claim.reason === "already_done" && claim.order) {
      return NextResponse.json({
        ok: true,
        alreadyDone: true,
        orderId: claim.order.id,
        amount: claim.order.amount_won,
        receiptUrl: claim.order.pg_receipt_url ?? undefined,
      });
    }
    // 결제는 이미 끝났으니 사장님에게는 성공으로 알린다
    return NextResponse.json(
      { ok: true, pending: true, orderId: order.id, message: "결제를 처리하고 있어요" },
      { status: 202 }
    );
  }

  const done = await completeSaasOrder({
    order: claim.order!,
    pg: {
      paymentKey: verify.impUid,
      approvedAt: verify.approvedAt,
      method: verify.method,
      receiptUrl: verify.receiptUrl,
      raw: verify.raw,
    },
  });
  if (!done.ok) {
    return NextResponse.json({ error: done.error }, { status: done.status ?? 500 });
  }

  return NextResponse.json({
    ok: true,
    orderId: order.id,
    amount: order.amount_won,
    receiptUrl: verify.receiptUrl,
    expiresOn: done.expiresOn,
  });
}
