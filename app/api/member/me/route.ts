import { NextResponse } from "next/server";
import { requireMemberContext, isMemberError } from "@/app/lib/member-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/member/me
 * 로그인·연동된 회원 본인 프로필 + 소속 센터.
 * 연동 전이면 requireMemberContext 가 409 MEMBER_NOT_LINKED 반환 → 앱은 온보딩으로 유도.
 */
export async function GET(request: Request) {
  const ctx = await requireMemberContext(request);
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
