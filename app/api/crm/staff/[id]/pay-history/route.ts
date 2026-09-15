import { NextResponse } from "next/server";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { loadPayHistory } from "@/app/lib/crm-pay-history";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/staff/[id]/pay-history — 직원 수업료(급여) 설정 이력 (적용 시작일 오름차순)
 * 접근: 직원 상세와 동일 — 센터 관리자(owner/admin/manager) 또는 본인.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const memberId = Number(id);
  if (!memberId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const isManagerish = ctx.role === "owner" || ctx.role === "admin" || ctx.role === "manager";
  const isSelf = memberId === ctx.centerMemberId;
  if (!isManagerish && !isSelf) {
    return NextResponse.json({ error: "본인 정보만 조회할 수 있습니다" }, { status: 403 });
  }

  const history = (await loadPayHistory(ctx.centerId, [memberId])).get(memberId) ?? [];
  return NextResponse.json({ history });
}
