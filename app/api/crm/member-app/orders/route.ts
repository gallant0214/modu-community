import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";
import { PRODUCT_SELECT, type SellableProduct } from "@/app/lib/member-purchase";
import { tossClientKey } from "@/app/lib/toss-payments";
import {
  quoteCart,
  expireStaleOrders,
  ORDER_TTL_MINUTES,
  onlineSalesEnabled,
  SALES_DISABLED_MESSAGE,
} from "@/app/lib/member-checkout";
import { claimCoupon, releaseCoupon } from "@/app/lib/crm-coupons-server";
import { completeOrder, type OrderRow } from "@/app/lib/member-order-complete";
import { signOrderToken } from "@/app/lib/order-token";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ORDER_SELECT =
  "id, center_id, member_id, product_id, product_name, amount_won, list_price_won, " +
  "coupon_issue_id, coupon_discount_won, mileage_used, mileage_earned, channel, status";

/**
 * POST /api/crm/member-app/orders
 *   { centerId, productId, couponIssueId?, mileageUse?, channel? }
 *
 * 결제창을 띄우기 전에 주문을 먼저 만든다.
 *
 * 🚨 금액은 **앱/웹이 보낸 값을 쓰지 않고 서버가 다시 계산**한다(quoteCart).
 *    클라이언트에서 받는 건 "무엇을 쓰겠다"는 의사뿐 — 상품·쿠폰·마일리지 희망액.
 *    승인 단계에서 이 주문에 저장된 금액을 PG 에 그대로 넘겨 위변조를 막는다.
 *
 * 쿠폰은 **주문을 만드는 시점에 잠근다**(claimCoupon). 결제창에서 이탈해도
 * expires_at(기본 30분)이 지나면 자동으로 풀린다.
 *
 * 최종 결제액이 0원(증정 쿠폰·마일리지 전액)이면 PG 를 거칠 수 없으므로
 * 그 자리에서 발급까지 끝낸다.
 *
 * GET /api/crm/member-app/orders?centerId=1 → 내 주문 내역
 */
export async function POST(request: Request) {
  let body: {
    centerId?: number;
    /** 단품 구매 (이전 방식 — 계속 지원) */
    productId?: number;
    /** 묶음 구매 — 회원권·수강권 + 운동복 */
    productIds?: number[];
    couponIssueId?: number | null;
    mileageUse?: number | null;
    channel?: string;
  };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const centerId = Number(body.centerId);
  const ctx = await requireMemberForCenter(request, centerId);
  if (isMemberError(ctx)) return ctx;

  const productIds = (
    Array.isArray(body.productIds) && body.productIds.length > 0
      ? body.productIds
      : body.productId
        ? [body.productId]
        : []
  )
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
  if (productIds.length === 0) {
    return NextResponse.json({ error: "상품을 선택해주세요" }, { status: 400 });
  }
  if (productIds.length > 10) {
    return NextResponse.json({ error: "한 번에 최대 10개까지 담을 수 있어요" }, { status: 400 });
  }

  if (!onlineSalesEnabled()) {
    return NextResponse.json({ error: SALES_DISABLED_MESSAGE }, { status: 503 });
  }
  const channel = body.channel === "web" ? "web" : "app";

  // 시한 지난 내 주문을 먼저 정리 — 묶여 있던 쿠폰·마일리지를 이번 주문에 쓸 수 있게
  await expireStaleOrders({ centerId, memberId: ctx.memberId });

  const { data } = await supabase
    .from("crm_products")
    .select(PRODUCT_SELECT)
    .in("id", productIds)
    .eq("center_id", centerId);
  const found = (data ?? []) as unknown as SellableProduct[];
  // 화면이 보낸 순서를 지킨다 (요약·영수증에 담은 순서대로 보이도록)
  const products = productIds
    .map((id) => found.find((p) => Number(p.id) === id))
    .filter((p): p is SellableProduct => !!p);
  if (products.length !== productIds.length) {
    return NextResponse.json({ error: "지금은 구매할 수 없는 상품이 있어요" }, { status: 400 });
  }

  /* ── 금액 확정 ────────────────────────────────────────── */
  const quote = await quoteCart({
    centerId,
    memberId: ctx.memberId,
    products,
    couponIssueId: body.couponIssueId ?? null,
    mileageUse: body.mileageUse ?? null,
  });
  if (!quote.ok) {
    return NextResponse.json({ error: quote.error ?? "주문을 만들 수 없어요" }, { status: 400 });
  }
  // 회원이 쿠폰을 골랐는데 쓸 수 없는 상태면 조용히 빼지 않고 알려준다
  if (body.couponIssueId && quote.couponError) {
    return NextResponse.json({ error: quote.couponError }, { status: 400 });
  }
  // 회원이 쓰겠다고 한 마일리지가 한도를 넘었으면 되묻는다(모르는 채 덜 쓰이면 안 된다)
  const wantedMileage = Math.max(0, Math.floor(Number(body.mileageUse) || 0));
  if (wantedMileage > quote.mileageUsedWon) {
    return NextResponse.json(
      {
        error: `사용 가능한 마일리지는 ${quote.mileageMax.toLocaleString()}P 예요`,
        mileageMax: quote.mileageMax,
      },
      { status: 400 }
    );
  }

  /* ── 쿠폰 잠금 ────────────────────────────────────────── */
  let couponIssueId: number | null = null;
  if (quote.coupon) {
    const claim = await claimCoupon({
      centerId,
      memberId: ctx.memberId,
      issueId: quote.coupon.issueId,
      originalPriceWon: quote.listPriceWon,
      totalDiscountWon: quote.couponDiscountWon,
      productType: products[0].type,
      productId: products[0].id,
      vatIncluded: products.every((p) => p.vat_included !== false),
      actor: { uid: ctx.uid, name: ctx.name },
    });
    if (!claim.ok) {
      return NextResponse.json({ error: claim.error ?? "쿠폰을 쓸 수 없어요" }, { status: 400 });
    }
    couponIssueId = claim.issueId ?? null;
  }

  /* ── 주문 생성 ────────────────────────────────────────── */
  // 주문번호 — 토스 규격(6~64자)에 맞추고 추측이 어렵게 난수를 섞는다
  const rand = Math.random().toString(36).slice(2, 10);
  const orderUid = `mo_${centerId}_${ctx.memberId}_${Date.now().toString(36)}_${rand}`;
  const expiresAt = new Date(Date.now() + ORDER_TTL_MINUTES * 60 * 1000).toISOString();

  // 주문 이름 — 묶음이면 "회원권 외 1건" 처럼 (PG 결제창·영수증에 그대로 보인다)
  const orderName =
    products.length === 1 ? products[0].name : `${products[0].name} 외 ${products.length - 1}건`;

  const { data: inserted, error } = await supabase
    .from("crm_orders")
    .insert({
      center_id: centerId,
      member_id: ctx.memberId,
      product_id: products[0].id,
      product_name: orderName,
      product_type: products[0].type,
      list_price_won: quote.listPriceWon,
      coupon_issue_id: couponIssueId,
      coupon_discount_won: quote.couponDiscountWon,
      mileage_used: quote.mileageUsedWon,
      mileage_earned: quote.mileageEarn,
      amount_won: quote.amountWon,
      status: "pending",
      order_uid: orderUid,
      pg_provider: "toss",
      channel,
      expires_at: expiresAt,
    } as never)
    .select(ORDER_SELECT)
    .single();

  if (error || !inserted) {
    // 주문이 안 만들어졌으면 잠가둔 쿠폰을 반드시 풀어준다
    if (couponIssueId) await releaseCoupon(couponIssueId);
    return NextResponse.json(
      { error: "주문 생성에 실패했어요", detail: error?.message },
      { status: 500 }
    );
  }
  const order = inserted as unknown as OrderRow & { order_uid?: string };

  /* ── 주문 항목 저장 ───────────────────────────────────
     금액은 quoteCart 가 배분한 값을 그대로 쓴다 — 항목 합계 = 주문 총액 */
  const { error: itemErr } = await supabase.from("crm_order_items").insert(
    quote.lines.map((l) => ({
      order_id: order.id,
      center_id: centerId,
      member_id: ctx.memberId,
      product_id: l.productId,
      product_name: l.name,
      product_type: l.type,
      list_price_won: l.listPriceWon,
      coupon_discount_won: l.couponDiscountWon,
      mileage_used: l.mileageUsedWon,
      mileage_earned: l.mileageEarn,
      amount_won: l.amountWon,
    })) as never
  );
  if (itemErr) {
    if (couponIssueId) await releaseCoupon(couponIssueId);
    await supabase.from("crm_orders").delete().eq("id", order.id);
    return NextResponse.json(
      { error: "주문 생성에 실패했어요", detail: itemErr.message },
      { status: 500 }
    );
  }

  /* ── 0원 주문 — PG 를 거칠 수 없으니 바로 발급 ─────────── */
  if (quote.amountWon === 0) {
    const done = await completeOrder({ order, memberName: ctx.name });
    if (!done.ok) {
      return NextResponse.json({ error: done.error }, { status: done.status });
    }
    return NextResponse.json({
      free: true,
      orderId: order.id,
      orderUid,
      amount: 0,
      issued: done.issued,
      items: done.items ?? [],
    });
  }

  const payToken = signOrderToken(orderUid);

  return NextResponse.json({
    free: false,
    orderId: order.id,
    orderUid,
    amount: quote.amountWon,
    listPrice: quote.listPriceWon,
    couponDiscount: quote.couponDiscountWon,
    mileageUsed: quote.mileageUsedWon,
    orderName,
    lines: quote.lines,
    customerName: ctx.name || undefined,
    // 토스 결제위젯이 요구하는 고객 식별자 — 회원별로 항상 같은 값
    customerKey: `m_${centerId}_${ctx.memberId}`,
    clientKey: tossClientKey(),
    /**
     * 웹·앱이 공통으로 여는 결제 페이지.
     * 토큰은 이 주문 하나에만 유효 — 회원앱 WebView 처럼 웹 로그인 세션이 없는 곳에서 쓴다.
     */
    payUrl: `/pay/${orderUid}?t=${payToken}`,
    payToken,
    expiresAt,
  });
}

export async function GET(request: Request) {
  const centerId = Number(new URL(request.url).searchParams.get("centerId"));
  const ctx = await requireMemberForCenter(request, centerId);
  if (isMemberError(ctx)) return ctx;

  const { data } = await supabase
    .from("crm_orders")
    .select(
      "id, product_name, product_type, list_price_won, coupon_discount_won, mileage_used, " +
        "mileage_earned, amount_won, status, channel, pg_method, pg_receipt_url, issued_kind, " +
        "refunded_at, refund_amount, fail_reason, created_at"
    )
    .eq("center_id", centerId)
    .eq("member_id", ctx.memberId)
    .neq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({ orders: data ?? [] });
}
