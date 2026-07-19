import { NextResponse } from "next/server";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { fetchSales, saleCategory, saleYm } from "@/app/lib/crm-sales";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/stats/trend
 * 최근 12개월 매출 추이 (대시보드용). 실매출 원장 crm_sales 기준.
 *
 * 응답: [{ ym: "2026-01", revenue(수강권=PT/예약권), membershipRevenue(회원권=멤버십) }, ...] 12개
 *
 * 매출 원장엔 강사 귀속이 없어 재무 권한이 없는 trainer/manager 는 0 반환(데이터 격리).
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  // 12개월 윈도우
  const now = new Date();
  const months: { ym: string; start: string; end: string; revenue: number; membershipRevenue: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const start = `${ym}-01`;
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
    months.push({ ym, start, end, revenue: 0, membershipRevenue: 0 });
  }

  // 재무 = owner/admin 만 (crm_sales 는 강사 귀속 없음)
  if (ctx.role === "owner" || ctx.role === "admin") {
    try {
      const byYm = new Map(months.map((m) => [m.ym, m]));
      const sales = await fetchSales(ctx.centerId, months[0].start, months[11].end);
      for (const s of sales) {
        const bucket = byYm.get(saleYm(s.tx_at));
        if (!bucket) continue;
        const cat = saleCategory(s.product_type);
        if (cat === "membership") bucket.membershipRevenue += s.amount_won;
        else if (cat === "lesson") bucket.revenue += s.amount_won;
      }
    } catch (e) {
      return NextResponse.json(
        { error: "조회 실패", detail: e instanceof Error ? e.message : String(e) },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    months: months.map(({ ym, revenue, membershipRevenue }) => ({ ym, revenue, membershipRevenue })),
  });
}
