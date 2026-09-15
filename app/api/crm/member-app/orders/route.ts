import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";
import { PRODUCT_SELECT, isSellable, type SellableProduct } from "@/app/lib/member-purchase";
import { tossClientKey } from "@/app/lib/toss-payments";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/member-app/orders   { centerId, productId }
 * 결제창을 띄우기 전에 주문을 먼저 만든다.
 *
 * 🚨 금액은 **앱이 보낸 값을 쓰지 않고 서버가 상품에서 읽어 확정**한다.
 *    승인 단계에서 이 금액을 PG 에 그대로 넘겨 위변조를 막는다.
 *
 * GET /api/crm/member-app/orders?centerId=1 → 내 주문 내역
 */
export async function POST(request: Request) {
  let body: { centerId?: number; productId?: number };
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

  const { data } = await supabase
    .from("crm_products")
    .select(PRODUCT_SELECT)
    .eq("id", productId)
    .eq("center_id", centerId)
    .maybeSingle();
  const product = data as unknown as SellableProduct | null;
  if (!product || !isSellable(product)) {
    return NextResponse.json({ error: "지금은 구매할 수 없는 상품이에요" }, { status: 400 });
  }

  // 주문번호 — 토스 규격(6~64자)에 맞추고 추측이 어렵게 난수를 섞는다
  const rand = Math.random().toString(36).slice(2, 10);
  const orderUid = `mo_${centerId}_${ctx.memberId}_${Date.now().toString(36)}_${rand}`;

  const { data: order, error } = await supabase
    .from("crm_orders")
    .insert({
      center_id: centerId,
      member_id: ctx.memberId,
      product_id: product.id,
      product_name: product.name,
      product_type: product.type,
      amount_won: product.price_won,
      status: "pending",
      order_uid: orderUid,
      pg_provider: "toss",
    } as never)
    .select("id, order_uid, amount_won, product_name")
    .single();

  if (error || !order) {
    return NextResponse.json({ error: "주문 생성에 실패했어요" }, { status: 500 });
  }
  const o = order as { id: number; order_uid: string; amount_won: number; product_name: string };

  return NextResponse.json({
    orderId: o.id,
    orderUid: o.order_uid,
    amount: o.amount_won,
    orderName: o.product_name,
    customerName: ctx.name || undefined,
    clientKey: tossClientKey(),
  });
}

export async function GET(request: Request) {
  const centerId = Number(new URL(request.url).searchParams.get("centerId"));
  const ctx = await requireMemberForCenter(request, centerId);
  if (isMemberError(ctx)) return ctx;

  const { data } = await supabase
    .from("crm_orders")
    .select("id, product_name, product_type, amount_won, status, pg_method, pg_receipt_url, issued_kind, created_at")
    .eq("center_id", centerId)
    .eq("member_id", ctx.memberId)
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({ orders: data ?? [] });
}
