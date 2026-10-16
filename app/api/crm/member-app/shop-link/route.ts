import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/member-app/shop-link?centerId=
 * 회원앱 '이용권 구매'가 열 웹 결제 페이지(/shop/[slug]) 주소.
 * 웹과 완전히 동일한 결제 흐름(로그인·상품·쿠폰·마일리지·이니시스 결제)을 쓰기 위해
 * 앱은 네이티브 결제창 대신 이 주소를 시스템 브라우저로 연다.
 * slug 미발급 센터면 slug: null → 앱이 네이티브 화면으로 폴백.
 */
export async function GET(request: Request) {
  const centerId = Number(new URL(request.url).searchParams.get("centerId"));
  const ctx = await requireMemberForCenter(request, centerId);
  if (isMemberError(ctx)) return ctx;

  const { data } = await supabase
    .from("crm_centers")
    .select("shop_slug")
    .eq("id", ctx.centerId)
    .maybeSingle();
  const slug = (data as { shop_slug: string | null } | null)?.shop_slug ?? null;

  return NextResponse.json({ slug, path: slug ? `/shop/${slug}` : null });
}
