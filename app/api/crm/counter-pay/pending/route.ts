import { NextResponse } from "next/server";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import { listCounterRequests } from "@/app/lib/crm-counter-pay";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/counter-pay/pending — 승인을 기다리는 카운터 결제 요청 (대시보드 상단 배너용).
 * 권한(sales.counter_confirm)이 없으면 403 대신 빈 목록 — 배너는 조용히 숨으면 된다.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "sales.counter_confirm"))) {
    return NextResponse.json({ items: [], allowed: false });
  }
  return NextResponse.json({ items: await listCounterRequests(ctx.centerId), allowed: true });
}
