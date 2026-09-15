import { NextResponse } from "next/server";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { computeSettlement, resolveSettlementPeriod } from "@/app/lib/crm-settlement";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/stats/settlement?ym=YYYY-MM | ?from=YYYY-MM-DD&to=YYYY-MM-DD | ?quarter=YYYY-Q#
 *
 * 순이익 = 총매출 − 고정지출 − 부가세(납부예상) − 카드수수료 − 직원급여 − 추가지출 + 추가수입.
 * 계산 로직은 app/lib/crm-settlement.ts (경영 요약 탭과 공유).
 * quarter 는 분기 부가세 집계용.
 *
 * admin 이상만 (재무 정보).
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const period = resolveSettlementPeriod(url.searchParams);
  const result = await computeSettlement(ctx.centerId, period);
  return NextResponse.json(result);
}
