import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";
import { shopRegistrationType } from "@/app/lib/crm-registration-type";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/member-app/me?centerId=
 * 선택한 센터에서의 내 회원 기본 정보.
 */
export async function GET(request: Request) {
  const centerId = Number(new URL(request.url).searchParams.get("centerId"));
  const ctx = await requireMemberForCenter(request, centerId);
  if (isMemberError(ctx)) return ctx;

  const { data } = await supabase
    .from("crm_members")
    .select("mileage")
    .eq("id", ctx.memberId)
    .maybeSingle();
  const m = data as { mileage: number | null } | null;

  // 신규/재등록 구분 — 판매 페이지가 내가 살 수 있는 상품만 보여주는 데 쓴다.
  // 🚨 이용권 구매 전용 규칙: 결제 1건↑=재등록 (CRM 통계용 2회↑와 다름).
  const registrationType = await shopRegistrationType(ctx.centerId, ctx.memberId);

  return NextResponse.json({
    member: {
      id: ctx.memberId,
      name: ctx.name,
      phone: ctx.phone,
      centerId: ctx.centerId,
      centerName: ctx.centerName,
      registrationType,
      mileage: m?.mileage ?? 0,
    },
  });
}
