import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";
import { verifyPortonePayment } from "@/app/lib/portone-payments";
import {
  completeOrder,
  claimOrderForFulfillment,
  releaseOrderClaim,
  type OrderRow,
} from "@/app/lib/member-order-complete";
import { releaseCoupon } from "@/app/lib/crm-coupons-server";
import { verifyOrderToken } from "@/app/lib/order-token";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ORDER_SELECT =
  "id, center_id, member_id, product_id, product_name, amount_won, list_price_won, " +
  "coupon_issue_id, coupon_discount_won, mileage_used, mileage_earned, channel, status, " +
  "issued_kind, issued_id, expires_at, pg_receipt_url";

/**
 * POST /api/crm/member-app/orders/confirm
 *   { centerId, orderUid, impUid, token? }
 *
 * 결제 **검증** → 발급까지 한 번에. 순서가 안전의 전부다.
 *   1) 주문을 DB 에서 찾는다 (금액·상품은 **주문에 저장된 값**만 쓴다)
 *   2) 포트원에 직접 물어 결제를 검증 — 여기서 통과해야만 다음 단계로 간다
 *   3) claimOrderForFulfillment() — 웹훅과의 경합을 조건부 UPDATE 로 선점
 *   4) completeOrder() — 발급 · 마일리지 정산 · 결제 원장 · 쿠폰 확정 · 알림
 *
 * 🚨 토스 시절과 결정적으로 다른 점: 포트원은 결제창에서 **이미 승인이 끝난** 뒤
 *    imp_uid 가 온다. 즉 이 라우트에 들어온 시점에 **돈은 이미 빠져 있다.**
 *    - 금액·주문번호가 어긋나면 verifyPortonePayment() 가 즉시 취소까지 한다
 *    - 조회 자체가 실패했으면 결제 성공 여부를 **모르는** 상태다. 이때 주문을
 *      failed 로 적고 쿠폰을 풀면, 뒤늦게 웹훅이 와서 발급할 때 할인 근거가 사라진다.
 *      → 모를 때는 pending 그대로 두고 웹훅에 맡긴다.
 *
 * 멱등: 이미 발급된 주문이면 다시 발급하지 않고 기존 결과를 돌려준다
 * (네트워크 문제로 재시도해도 이중 발급되지 않는다).
 */
export async function POST(request: Request) {
  let body: {
    centerId?: number;
    orderUid?: string;
    /** 포트원 결제 식별자 */
    impUid?: string;
    /** 결제 페이지가 보내는 주문 토큰 — 웹 로그인 세션이 없는 앱 브라우저용 */
    token?: string;
  };
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

  /* ── 1) 주문 조회 ────────────────────────────────────────
     인증은 두 갈래. 어느 쪽이든 **발급물은 주문에 적힌 회원에게만** 간다.
       · 주문 토큰  — 결제 페이지(앱 WebView 포함). 그 주문 하나에만 유효
       · 회원 로그인 — 앱이 직접 호출하는 경우                                */
  const byToken = verifyOrderToken(body.token, orderUid);
  let memberName = "";

  let query = supabase.from("crm_orders").select(ORDER_SELECT).eq("order_uid", orderUid);
  if (!byToken) {
    const centerId = Number(body.centerId);
    const ctx = await requireMemberForCenter(request, centerId);
    if (isMemberError(ctx)) return ctx;
    memberName = ctx.name;
    query = query.eq("center_id", centerId).eq("member_id", ctx.memberId);
  }
  const { data: orderRow } = await query.maybeSingle();
  const order = orderRow as unknown as
    | (OrderRow & {
        issued_kind: string | null;
        issued_id: number | null;
        expires_at: string | null;
        pg_receipt_url: string | null;
      })
    | null;
  if (!order) {
    return NextResponse.json({ error: "주문을 찾을 수 없어요" }, { status: 404 });
  }

  if (byToken) {
    const { data: mem } = await supabase
      .from("crm_members")
      .select("name")
      .eq("id", order.member_id)
      .maybeSingle();
    memberName = (mem as { name?: string } | null)?.name ?? "";
  }

  // 이미 처리된 주문 → 그대로 성공 응답 (재시도 안전)
  if (order.status === "paid" && order.issued_id) {
    return NextResponse.json({
      ok: true,
      alreadyDone: true,
      orderId: order.id,
      amount: order.amount_won,
      receiptUrl: order.pg_receipt_url ?? undefined,
      issued: { kind: order.issued_kind, id: order.issued_id },
    });
  }
  if (order.status === "processing") {
    // 웹훅이 먼저 잡아 발급 중 — 잠깐 뒤 주문 내역에서 확인된다
    return NextResponse.json(
      { ok: true, pending: true, orderId: order.id, message: "결제를 처리하고 있어요" },
      { status: 202 }
    );
  }
  if (order.status !== "pending") {
    return NextResponse.json({ error: "이미 종료된 주문이에요" }, { status: 409 });
  }

  /* ── 2) PG 검증 — 금액은 주문에 저장된 서버 값으로 대조한다 ── */
  const confirm = await verifyPortonePayment({
    impUid,
    orderUid,
    amountWon: order.amount_won,
  });
  if (!confirm.ok) {
    /* 결제가 성공했는지 **모르는** 경우(조회 실패)에는 주문을 건드리지 않는다.
       failed 로 적고 쿠폰을 풀어버리면, 실제로는 결제가 됐는데 웹훅이 뒤늦게
       발급할 때 할인 근거가 없어져 금액이 어긋난다. 모를 때는 웹훅에 맡긴다. */
    if (confirm.code === "LOOKUP_FAILED") {
      return NextResponse.json(
        {
          error:
            "결제 결과를 확인하지 못했어요. 결제가 되었다면 잠시 뒤 자동으로 처리됩니다. " +
            "주문 내역을 확인해주세요.",
        },
        { status: 503 }
      );
    }
    await supabase
      .from("crm_orders")
      .update({
        status: "failed",
        fail_reason: confirm.error ?? "검증 실패",
        pg_payment_key: impUid,
        pg_raw: (confirm.raw ?? null) as never,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", order.id);
    // 결제가 안 됐거나 되돌렸으니 잡아뒀던 쿠폰은 돌려준다 (마일리지는 아직 차감 전)
    if (order.coupon_issue_id) await releaseCoupon(order.coupon_issue_id);
    return NextResponse.json({ error: confirm.error ?? "결제를 확인하지 못했어요" }, { status: 402 });
  }

  /* ── 3) 발급 권한을 원자적으로 선점 ────────────────────
     🚨 웹훅이 같은 주문을 동시에 발급할 수 있다. 조건부 UPDATE 로 한쪽만 이긴다.
        (2026-09-24 이중 발급 사고 — 읽고 나서 쓰는 방식은 동시 실행을 못 막는다) */
  const claim = await claimOrderForFulfillment(order.id);
  if (!claim.won) {
    if (claim.reason === "already_done" && claim.order) {
      return NextResponse.json({
        ok: true,
        alreadyDone: true,
        orderId: claim.order.id,
        amount: claim.order.amount_won,
        receiptUrl: claim.order.pg_receipt_url ?? undefined,
        issued: { kind: claim.order.issued_kind, id: claim.order.issued_id },
      });
    }
    // 웹훅이 처리 중 — 승인은 이미 끝났으니 회원에게는 성공으로 알린다
    return NextResponse.json(
      { ok: true, pending: true, orderId: order.id, message: "결제를 처리하고 있어요" },
      { status: 202 }
    );
  }

  /* ── 4) 발급 · 마일리지 · 원장 · 쿠폰 · 알림 ──────────── */
  const done = await completeOrder({
    order: claim.order,
    memberName,
    pg: {
      paymentKey: confirm.impUid,
      approvedAt: confirm.approvedAt,
      method: confirm.method,
      receiptUrl: confirm.receiptUrl,
      raw: confirm.raw,
    },
  });
  if (!done.ok) {
    return NextResponse.json({ error: done.error }, { status: done.status });
  }
  void releaseOrderClaim; // 발급 실패 시 상태는 completeOrder 가 직접 정리한다

  return NextResponse.json({
    ok: true,
    orderId: order.id,
    amount: order.amount_won,
    receiptUrl: confirm.receiptUrl,
    issued: done.issued,
  });
}
