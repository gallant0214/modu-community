import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";
import { confirmTossPayment } from "@/app/lib/toss-payments";
import {
  PRODUCT_SELECT,
  fulfillPurchase,
  recordPayment,
  type SellableProduct,
} from "@/app/lib/member-purchase";
import { sendLocalizedPushToMember } from "@/app/lib/member-notify";
import { notifyCenterStaffSignupPurchase } from "@/app/lib/crm-staff-notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/crm/member-app/orders/confirm
 *   { centerId, orderUid, paymentKey, amount }
 *
 * 결제 승인 → 발급까지 한 번에. 순서가 안전의 전부다.
 *   1) 주문을 DB 에서 찾는다 (금액·상품은 **주문에 저장된 값**을 쓴다. 앱이 보낸 amount 는 참고만)
 *   2) 토스 서버에 직접 승인 요청 — 여기서 성공해야만 다음 단계로 간다
 *   3) 상품 발급 + 결제 원장 기록
 *   4) 회원 푸시 + 센터 직원 알림
 *
 * 멱등: 이미 발급된 주문이면 다시 발급하지 않고 기존 결과를 돌려준다
 * (앱이 네트워크 문제로 재시도해도 이중 발급되지 않는다).
 */
export async function POST(request: Request) {
  let body: { centerId?: number; orderUid?: string; paymentKey?: string; amount?: number };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const centerId = Number(body.centerId);
  const ctx = await requireMemberForCenter(request, centerId);
  if (isMemberError(ctx)) return ctx;

  const orderUid = String(body.orderUid ?? "").trim();
  const paymentKey = String(body.paymentKey ?? "").trim();
  if (!orderUid || !paymentKey) {
    return NextResponse.json({ error: "결제 정보가 올바르지 않아요" }, { status: 400 });
  }

  // 1) 주문 조회 — 반드시 본인 주문이어야 한다
  const { data: orderRow } = await supabase
    .from("crm_orders")
    .select("*")
    .eq("order_uid", orderUid)
    .eq("center_id", centerId)
    .eq("member_id", ctx.memberId)
    .maybeSingle();
  const order = orderRow as {
    id: number;
    product_id: number | null;
    product_name: string;
    amount_won: number;
    status: string;
    issued_kind: string | null;
    issued_id: number | null;
  } | null;
  if (!order) {
    return NextResponse.json({ error: "주문을 찾을 수 없어요" }, { status: 404 });
  }

  // 이미 처리된 주문 → 그대로 성공 응답 (재시도 안전)
  if (order.status === "paid" && order.issued_id) {
    return NextResponse.json({
      ok: true,
      alreadyDone: true,
      orderId: order.id,
      issued: { kind: order.issued_kind, id: order.issued_id },
    });
  }
  if (order.status !== "pending") {
    return NextResponse.json({ error: "이미 종료된 주문이에요" }, { status: 409 });
  }

  // 2) PG 승인 — 금액은 주문에 저장된 서버 값을 넘긴다
  const confirm = await confirmTossPayment({
    paymentKey,
    orderId: orderUid,
    amount: order.amount_won,
  });
  if (!confirm.ok) {
    await supabase
      .from("crm_orders")
      .update({
        status: "failed",
        fail_reason: confirm.error ?? "승인 실패",
        pg_payment_key: paymentKey,
        pg_raw: (confirm.raw ?? null) as never,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", order.id);
    return NextResponse.json({ error: confirm.error ?? "결제 승인에 실패했어요" }, { status: 402 });
  }

  // 3) 상품 발급
  const { data: pData } = await supabase
    .from("crm_products")
    .select(PRODUCT_SELECT)
    .eq("id", order.product_id ?? 0)
    .maybeSingle();
  const product = pData as unknown as SellableProduct | null;
  if (!product) {
    // 결제는 됐는데 상품이 사라진 경우 — 발급 보류로 남기고 센터가 수동 처리하게 한다
    await supabase
      .from("crm_orders")
      .update({
        status: "paid",
        pg_payment_key: confirm.paymentKey,
        pg_approved_at: confirm.approvedAt,
        pg_method: confirm.method,
        pg_receipt_url: confirm.receiptUrl,
        pg_raw: (confirm.raw ?? null) as never,
        fail_reason: "상품 정보를 찾을 수 없어 발급 보류",
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", order.id);
    return NextResponse.json(
      { error: "결제는 완료됐지만 상품 발급에 실패했어요. 센터에 문의해주세요." },
      { status: 500 }
    );
  }

  let issued;
  try {
    issued = await fulfillPurchase({
      centerId,
      memberId: ctx.memberId,
      product,
      amountWon: order.amount_won,
      pgMethod: confirm.method,
    });
  } catch (e) {
    await supabase
      .from("crm_orders")
      .update({
        status: "paid",
        pg_payment_key: confirm.paymentKey,
        pg_approved_at: confirm.approvedAt,
        pg_method: confirm.method,
        pg_receipt_url: confirm.receiptUrl,
        pg_raw: (confirm.raw ?? null) as never,
        fail_reason: `발급 실패: ${e instanceof Error ? e.message : "알 수 없음"}`,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", order.id);
    return NextResponse.json(
      { error: "결제는 완료됐지만 상품 발급에 실패했어요. 센터에 문의해주세요." },
      { status: 500 }
    );
  }

  const paymentId = await recordPayment({
    centerId,
    memberId: ctx.memberId,
    orderId: order.id,
    amountWon: order.amount_won,
    outcome: issued,
    note: `회원앱 구매 · ${order.product_name}`,
  });

  await supabase
    .from("crm_orders")
    .update({
      status: "paid",
      pg_payment_key: confirm.paymentKey,
      pg_approved_at: confirm.approvedAt,
      pg_method: confirm.method,
      pg_receipt_url: confirm.receiptUrl,
      pg_raw: (confirm.raw ?? null) as never,
      issued_kind: issued.kind,
      issued_id: issued.id,
      issued_extra: (issued.extra ?? null) as never,
      payment_id: paymentId,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", order.id);

  // 4) 알림 — 실패해도 결제/발급에는 영향 주지 않는다
  try {
    await sendLocalizedPushToMember(
      ctx.memberId,
      "purchase_done",
      "purchaseDone",
      { product: order.product_name },
      {}
    );
  } catch {
    /* 무시 */
  }
  try {
    await notifyCenterStaffSignupPurchase({
      centerId,
      kind: "purchase",
      memberId: ctx.memberId,
      memberName: ctx.name,
      productName: order.product_name,
      amountWon: order.amount_won,
    });
  } catch {
    /* 무시 */
  }

  return NextResponse.json({
    ok: true,
    orderId: order.id,
    amount: order.amount_won,
    receiptUrl: confirm.receiptUrl,
    issued: { kind: issued.kind, id: issued.id, ...issued.summary },
  });
}
