import { NextResponse } from "next/server";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import { loadSalesListItems } from "@/app/lib/crm-sales-list";
import { cached, crmCacheKey } from "@/app/lib/cache";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/stats/sales-list?ym=YYYY-MM  (또는 from=YYYY-MM-DD&to=YYYY-MM-DD)
 *
 * 해당 기간에 "결제된 상품" 라인아이템 리스트.
 * 센터 매출(center-revenue)과 동일한 소스 규칙:
 *   1) crm_sales 원장(BROJ 임포트) — 원장 커버 구간
 *   2) 원장 커버 컷오프(마지막 거래일) 이후의 CRM 결제(crm_payments)
 *   → 이중집계 없이 실제 매출과 리스트 합계가 일치. 계산은 crm-sales-list.ts(외부 연동 API 와 공용).
 *
 * 각 항목: { date, member_id, member_name, product_name, category, amount_won, payment_method, registration_type, source }
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "stats.view"))) {
    return NextResponse.json({ error: "통계 열람 권한이 없습니다" }, { status: 403 });
  }

  const url = new URL(request.url);
  const ymRaw = url.searchParams.get("ym");
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  const isRange =
    ymd.test(fromRaw || "") && ymd.test(toRaw || "") && (toRaw as string) >= (fromRaw as string);

  const ym = /^\d{4}-\d{2}$/.test(ymRaw || "")
    ? (ymRaw as string)
    : new Date().toISOString().slice(0, 7);

  let startDate: string;
  let nextMonth: string;
  if (isRange) {
    startDate = fromRaw as string;
    const to = new Date(`${toRaw}T00:00:00Z`);
    to.setUTCDate(to.getUTCDate() + 1);
    nextMonth = to.toISOString().slice(0, 10);
  } else {
    const [y, m] = ym.split("-").map(Number);
    startDate = `${ym}-01`;
    nextMonth = new Date(y, m, 1).toISOString().slice(0, 10);
  }

  // 기간별 결제 리스트도 무겁고 실시간성 낮음 → 60초 캐시.
  const cacheKey = crmCacheKey(
    ctx,
    "stats:sales-list",
    isRange ? `r:${startDate}:${nextMonth}` : ym,
  );
  const payload = await cached(cacheKey, 60, async () => {
  const items = await loadSalesListItems(ctx.centerId, startDate, nextMonth);
  const total = items.reduce((s, it) => s + (it.amount_won ?? 0), 0);

  return { ym, count: items.length, total, items };
  });

  return NextResponse.json(payload);
}
