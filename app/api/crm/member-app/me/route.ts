import { NextResponse } from "next/server";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/member-app/me?centerId=
 * 선택한 센터에서의 내 회원 기본 정보.
 */
export async function GET(request: Request) {
  const centerId = Number(new URL(request.url).searchParams.get("centerId"));
  const ctx = await requireMemberForCenter(request, centerId);
  if (isMemberError(ctx)) return ctx;

  return NextResponse.json({
    member: {
      id: ctx.memberId,
      name: ctx.name,
      phone: ctx.phone,
      centerId: ctx.centerId,
      centerName: ctx.centerName,
    },
  });
}
