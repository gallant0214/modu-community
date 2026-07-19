import { NextResponse } from "next/server";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { fetchSales, saleCategory, saleYm } from "@/app/lib/crm-sales";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/stats/trend
 * 최근 12개월 매출 추이 (대시보드용). 실매출 원장 crm_sales 기준.
 *
 * 응답: [{ ym, revenue(수강권=PT/예약권), membershipRevenue(회원권=멤버십),
 *          revenuePrev, membershipRevenuePrev(=전년 동월) }, ...] 12개
 *
 * 매출 원장엔 강사 귀속이 없어 재무 권한이 없는 trainer/manager 는 0 반환(데이터 격리).
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  // 12개월 윈도우 (표시용)
  const now = new Date();
  const months: { ym: string; end: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
    months.push({ ym, end });
  }
  const prevYm = (ym: string) => {
    const [y, m] = ym.split("-");
    return `${Number(y) - 1}-${m}`;
  };
  const empty = () => ({ lesson: 0, membership: 0 });
  const agg = new Map<string, { lesson: number; membership: number }>();

  // 재무 = owner/admin 만 (crm_sales 는 강사 귀속 없음)
  if (ctx.role === "owner" || ctx.role === "admin") {
    try {
      // 전년 동월 비교를 위해 24개월(표시 12 + 전년 12) 조회
      const prevStart = `${prevYm(months[0].ym)}-01`;
      const sales = await fetchSales(ctx.centerId, prevStart, months[11].end);
      for (const s of sales) {
        const cat = saleCategory(s.product_type);
        if (cat !== "lesson" && cat !== "membership") continue;
        const ym = saleYm(s.tx_at);
        const b = agg.get(ym) ?? empty();
        if (cat === "lesson") b.lesson += s.amount_won;
        else b.membership += s.amount_won;
        agg.set(ym, b);
      }
    } catch (e) {
      return NextResponse.json(
        { error: "조회 실패", detail: e instanceof Error ? e.message : String(e) },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    months: months.map(({ ym }) => {
      const cur = agg.get(ym) ?? empty();
      const prev = agg.get(prevYm(ym)) ?? empty();
      return {
        ym,
        revenue: cur.lesson,
        membershipRevenue: cur.membership,
        revenuePrev: prev.lesson,
        membershipRevenuePrev: prev.membership,
      };
    }),
  });
}
