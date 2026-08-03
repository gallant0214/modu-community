import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/member-app/contracts?centerId=&membershipId=&passId=
 * 본인의 서명 계약서. membershipId/passId 로 특정 상품 계약서만 필터.
 * 회원정보·상품·결제·약관 스냅샷 + 서명 이미지까지 그대로 반환(앱에서 뷰 렌더).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const centerId = Number(url.searchParams.get("centerId"));
  const ctx = await requireMemberForCenter(request, centerId);
  if (isMemberError(ctx)) return ctx;

  const membershipId = Number(url.searchParams.get("membershipId")) || null;
  const passId = Number(url.searchParams.get("passId")) || null;

  let query = supabase
    .from("crm_signed_contracts")
    .select(
      "id, title, customer_info, product_info, payment_info, terms_accepted, terms_snapshot, signature_data_url, trainer_signature_data_url, signed_at, status, membership_id, pass_id"
    )
    .eq("center_id", ctx.centerId)
    .eq("member_id", ctx.memberId)
    .eq("status", "signed")
    .order("signed_at", { ascending: false });

  if (membershipId) query = query.eq("membership_id", membershipId);
  if (passId) query = query.eq("pass_id", passId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({
    contracts: (data ?? []).map((c) => ({
      id: c.id,
      title: c.title,
      customerInfo: c.customer_info,
      productInfo: c.product_info,
      paymentInfo: c.payment_info,
      termsAccepted: c.terms_accepted,
      termsSnapshot: c.terms_snapshot,
      signatureUrl: c.signature_data_url,
      trainerSignatureUrl: c.trainer_signature_data_url,
      signedAt: c.signed_at,
    })),
  });
}
