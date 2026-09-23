import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";
import { PRODUCT_SELECT, type SellableProduct } from "@/app/lib/member-purchase";
import { quoteOrder, expireStaleOrders } from "@/app/lib/member-checkout";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/member-app/orders/quote
 *   { centerId, productId, couponIssueId?, mileageUse? }
 *
 * 결제 버튼을 누르기 전, 화면에 보여줄 **최종 금액을 서버가 계산해 준다.**
 * 주문 생성과 똑같은 함수(quoteOrder)를 쓰므로 "화면 금액과 실제 결제액이 다른" 일이 없다.
 * 쿠폰을 잠그지 않는다 — 회원이 이것저것 바꿔보는 단계이기 때문.
 */
export async function POST(request: Request) {
  let body: {
    centerId?: number;
    productId?: number;
    couponIssueId?: number | null;
    mileageUse?: number | null;
  };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const centerId = Number(body.centerId);
  const ctx = await requireMemberForCenter(request, centerId);
  if (isMemberError(ctx)) return ctx;

  const productId = Number(body.productId);
  if (!productId) {
    return NextResponse.json({ error: "상품을 선택해주세요" }, { status: 400 });
  }

  // 시한 지난 주문이 잡고 있던 마일리지를 풀어야 가용액이 정확해진다
  await expireStaleOrders({ centerId, memberId: ctx.memberId });

  const { data } = await supabase
    .from("crm_products")
    .select(PRODUCT_SELECT)
    .eq("id", productId)
    .eq("center_id", centerId)
    .maybeSingle();
  const product = data as unknown as SellableProduct | null;
  if (!product) {
    return NextResponse.json({ error: "지금은 구매할 수 없는 상품이에요" }, { status: 400 });
  }

  const quote = await quoteOrder({
    centerId,
    memberId: ctx.memberId,
    product,
    couponIssueId: body.couponIssueId ?? null,
    mileageUse: body.mileageUse ?? null,
  });
  if (!quote.ok) {
    return NextResponse.json({ error: quote.error ?? "계산할 수 없어요" }, { status: 400 });
  }

  return NextResponse.json({
    productId: product.id,
    productName: product.name,
    listPrice: quote.listPriceWon,
    couponDiscount: quote.couponDiscountWon,
    mileageUsed: quote.mileageUsedWon,
    amount: quote.amountWon,
    mileageEarn: quote.mileageEarn,
    mileageBalance: quote.mileageBalance,
    mileageHeld: quote.mileageHeld,
    mileageMax: quote.mileageMax,
    coupon: quote.coupon ?? null,
    couponError: quote.couponError ?? null,
    /** true 면 PG 결제창 없이 바로 발급된다 */
    free: quote.amountWon === 0,
  });
}
