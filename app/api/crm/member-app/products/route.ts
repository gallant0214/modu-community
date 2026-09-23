import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";
import { PRODUCT_SELECT, type SellableProduct } from "@/app/lib/member-purchase";
import { isOnlineSellable } from "@/app/lib/member-checkout";
import { tossClientKey, tossIsLive } from "@/app/lib/toss-payments";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/member-app/products?centerId=1
 * 회원앱에서 살 수 있는 상품 목록. 판매 스위치가 켜진 활성 상품만 내려준다.
 * 가격은 **서버 값이 정답**이고, 주문 생성 때 다시 확인한다.
 */
export async function GET(request: Request) {
  const centerId = Number(new URL(request.url).searchParams.get("centerId"));
  const ctx = await requireMemberForCenter(request, centerId);
  if (isMemberError(ctx)) return ctx;

  const { data, error } = await supabase
    .from("crm_products")
    .select(PRODUCT_SELECT)
    .eq("center_id", centerId)
    .eq("status", "active")
    .eq("sale_enabled", true)
    .eq("online_sale_enabled", true)
    .is("trainer_member_id", null) // 강사 개인 상품은 앱 판매 대상이 아님
    .order("type")
    .order("price_won");

  if (error) {
    return NextResponse.json({ error: "상품을 불러오지 못했어요" }, { status: 500 });
  }

  const products = ((data ?? []) as unknown as SellableProduct[])
    .filter(isOnlineSellable)
    .map((p) => ({
      id: p.id,
      type: p.type,
      billingMode: p.billing_mode,
      name: p.name,
      description: p.description,
      priceWon: p.price_won,
      vatIncluded: p.vat_included,
      durationValue: p.duration_value,
      durationUnit: p.duration_unit,
      totalSessions: p.total_sessions,
      sessionMinutes: p.session_minutes,
      mileageEarn: p.mileage_earn,
    }));

  return NextResponse.json({
    products,
    payment: { provider: "toss", clientKey: tossClientKey(), live: tossIsLive() },
  });
}
