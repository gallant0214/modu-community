import { NextResponse } from "next/server";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { computeNextStart } from "@/app/lib/next-start";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/members/[id]/next-start?type=membership|apparel|locker
 * 같은 종류의 유효한 이용권이 있으면 그 만료 다음날을 시작일로 반환. 없으면 오늘(KST).
 * 실제 계산은 회원앱 구매와 공용인 computeNextStart() 가 맡는다.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  const { id } = await params;
  const type = new URL(request.url).searchParams.get("type") || "membership";
  return NextResponse.json(await computeNextStart(ctx.centerId, Number(id) || 0, type));
}
