import { errDetail } from "@/app/lib/api-error";
import { NextResponse } from "next/server";
import { requireApiKey } from "@/app/lib/crm-api-key-auth";
import { loadOpenSales, openApiResponse, OPEN_SALE_COLUMNS, parseDayRange } from "@/app/lib/crm-open-data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/open/v1/sales?from=YYYY-MM-DD&to=YYYY-MM-DD[&include_refunds=0][&format=csv]
 * 기간 결제 + 환불 내역(둘 다 포함, 최대 366일). 없으면 이번 달 1일~오늘.
 *  - 결제 행(kind=결제): 결제 일시 기준, 양수. 통계 '매출 리스트'와 같은 계산(loadSalesListItems).
 *  - 환불 행(kind=환불): **환불 처리 일시 기준**, 음수. 주문번호·결제번호·환불번호로 원결제와 짝짓는다.
 *    포함 규칙은 CRM 통계·정산과 같다(fetchRefundSales) → 행 합계 = CRM 순매출.
 *  - include_refunds=0 이면 예전처럼 결제 행만.
 */
export async function GET(request: Request) {
  const key = await requireApiKey(request, "sales");
  if (key instanceof NextResponse) return key;
  const url = new URL(request.url);
  const range = parseDayRange(url);
  if ("error" in range) return NextResponse.json({ error: range.error }, { status: 400 });
  try {
    const includeRefunds = url.searchParams.get("include_refunds") !== "0";
    const rows = await loadOpenSales(key.centerId, range.from, range.to, { includeRefunds });
    const paymentTotal = rows.filter((r) => r.kind === "결제").reduce((s, r) => s + r.amount_won, 0);
    const refundTotal = rows.filter((r) => r.kind === "환불").reduce((s, r) => s + Math.abs(r.amount_won), 0);
    return openApiResponse(url, {
      name: "sales",
      centerName: key.centerName,
      columns: OPEN_SALE_COLUMNS,
      rows,
      meta: {
        from: range.from,
        to: range.to,
        include_refunds: includeRefunds,
        /** 행 금액 합계 = 결제 − 환불 (환불 포함 시) */
        total_won: paymentTotal - refundTotal,
        payment_total_won: paymentTotal,
        refund_total_won: refundTotal,
        payment_count: rows.filter((r) => r.kind === "결제").length,
        refund_count: rows.filter((r) => r.kind === "환불").length,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: "조회 실패", detail: errDetail(e) }, { status: 500 });
  }
}
