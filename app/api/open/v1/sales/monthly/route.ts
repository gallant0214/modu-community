import { errDetail } from "@/app/lib/api-error";
import { NextResponse } from "next/server";
import { requireApiKey } from "@/app/lib/crm-api-key-auth";
import { loadOpenMonthly, openApiResponse, OPEN_MONTHLY_COLUMNS, parseMonthRange } from "@/app/lib/crm-open-data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/open/v1/sales/monthly?from=YYYY-MM&to=YYYY-MM[&format=csv]
 * 월별 매출 합계·구분별 금액(최대 36개월). 없으면 최근 12개월. 결제 내역(sales)을 달마다 더한 값.
 */
export async function GET(request: Request) {
  const key = await requireApiKey(request, "sales");
  if (key instanceof NextResponse) return key;
  const url = new URL(request.url);
  const range = parseMonthRange(url);
  if ("error" in range) return NextResponse.json({ error: range.error }, { status: 400 });
  try {
    const rows = await loadOpenMonthly(key.centerId, range.from, range.to);
    return openApiResponse(url, {
      name: "sales-monthly",
      centerName: key.centerName,
      columns: OPEN_MONTHLY_COLUMNS,
      rows,
      meta: { from: range.from, to: range.to },
    });
  } catch (e) {
    return NextResponse.json({ error: "조회 실패", detail: errDetail(e) }, { status: 500 });
  }
}
