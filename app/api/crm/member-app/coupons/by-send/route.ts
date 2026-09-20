import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";
import { effectiveStatus } from "@/app/lib/crm-coupons";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/member-app/coupons/by-send?centerId=&sendId=
 * 쿠폰 도착 알림(couponSendId)에서 상세를 열기 위한 역참조 —
 * 이 회원이 해당 발송(send_id)으로 받은 쿠폰 1건을 목록과 동일한 형태로 반환.
 * (회수건 제외. 없으면 coupon: null)
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const centerId = Number(url.searchParams.get("centerId"));
  const sendId = Number(url.searchParams.get("sendId"));
  const ctx = await requireMemberForCenter(request, centerId);
  if (isMemberError(ctx)) return ctx;
  if (!Number.isInteger(sendId) || sendId <= 0) {
    return NextResponse.json({ coupon: null });
  }

  const { data: issue } = await supabase
    .from("crm_coupon_issues")
    .select("id, coupon_id, status, issued_at, expires_at, used_at")
    .eq("center_id", ctx.centerId)
    .eq("member_id", ctx.memberId)
    .eq("send_id", sendId)
    .neq("status", "revoked")
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!issue) return NextResponse.json({ coupon: null });

  const { data: def } = await supabase
    .from("crm_coupons")
    .select("id, name, description, benefit_type, amount_won, percent, max_discount_won, gift_product_id")
    .eq("id", issue.coupon_id as number)
    .maybeSingle();
  if (!def) return NextResponse.json({ coupon: null });

  let giftProductName: string | null = null;
  if (def.gift_product_id) {
    const { data: prod } = await supabase
      .from("crm_products")
      .select("name")
      .eq("id", def.gift_product_id as number)
      .maybeSingle();
    giftProductName = (prod as { name?: string } | null)?.name ?? null;
  }

  const eff = effectiveStatus({ status: issue.status, expires_at: issue.expires_at });
  if (eff === "revoked") return NextResponse.json({ coupon: null });
  const status = eff === "used" ? "used" : eff === "expired" ? "expired" : "active";

  const coupon = {
    id: issue.id,
    name: def.name,
    description: def.description ?? null,
    benefitType: def.benefit_type,
    amountWon: def.amount_won ?? null,
    percent: def.percent ?? null,
    maxDiscountWon: def.max_discount_won ?? null,
    giftProductName,
    expiresAt: issue.expires_at,
    status,
    usedAt: issue.used_at ?? null,
    issuedAt: issue.issued_at,
  };

  return NextResponse.json({ coupon });
}
