import { errDetail } from "@/app/lib/api-error";
import { NextResponse } from "next/server";
import { requireApiKey } from "@/app/lib/crm-api-key-auth";
import { loadOpenSales, openApiResponse, OPEN_SALE_COLUMNS, parseDayRange } from "@/app/lib/crm-open-data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/open/v1/sales?from=YYYY-MM-DD&to=YYYY-MM-DD[&format=csv]
 * 기간 결제 내역(둘 다 포함, 최대 366일). 없으면 이번 달 1일~오늘.
 * 통계 '매출 리스트'와 같은 계산(loadSalesListItems) — 환불은 음수 금액.
 */
export async function GET(request: Request) {
  const key = await requireApiKey(request, "sales");
  if (key instanceof NextResponse) return key;
  const url = new URL(request.url);
  const range = parseDayRange(url);
  if ("error" in range) return NextResponse.json({ error: range.error }, { status: 400 });
  try {
    const rows = await loadOpenSales(key.centerId, range.from, range.to);
    return openApiResponse(url, {
      name: "sales",
      centerName: key.centerName,
      columns: OPEN_SALE_COLUMNS,
      rows,
      meta: { from: range.from, to: range.to, total_won: rows.reduce((s, r) => s + r.amount_won, 0) },
    });
  } catch (e) {
    return NextResponse.json({ error: "조회 실패", detail: errDetail(e) }, { status: 500 });
  }
}
