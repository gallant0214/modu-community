import { NextResponse } from "next/server";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission, permissionDeniedResponse } from "@/app/lib/crm-permissions";
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

  // 본인 이력은 언제나. 다른 직원은 직급권한 '직원 급여·수업료 정책 보기'
  const isSelf = memberId === ctx.centerMemberId;
  if (!isSelf && !(await ctxHasPermission(ctx, "sales.payroll_view"))) {
    return permissionDeniedResponse("sales.payroll_view");
  }

  const history = (await loadPayHistory(ctx.centerId, [memberId])).get(memberId) ?? [];
  return NextResponse.json({ history });
}
