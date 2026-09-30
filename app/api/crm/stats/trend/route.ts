import { NextResponse } from "next/server";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { fetchSales, saleCategory, saleYm } from "@/app/lib/crm-sales";
import { fetchIssuanceSales, fetchRefundSales } from "@/app/lib/crm-sales-issuance";
import { ctxHasPermission } from "@/app/lib/crm-permissions";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/stats/trend
 * 최근 12개월 매출 추이 (대시보드용).
 * 원장(crm_sales) + 원장 컷오프 이후 CRM 발급분 − 환불(환불한 달). 대시보드 '이번달 상세'·정산과 같은 규칙이라
 * 이번달도 "조회 시점까지의 매출" 이 그대로 나온다.
 *
 * 응답: [{ ym, revenue(수강권=PT/예약권), membershipRevenue(회원권=멤버십),
 *          revenuePrev, membershipRevenuePrev(=전년 동월) }, ...] 12개
 *
 * 매출 원장엔 강사 귀속이 없어 dashboard.finance 권한이 없으면 0 반환(데이터 격리).
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

  // 재무 지표 = 직급권한 dashboard.finance (기본 owner·admin).
  // 🚨 예전엔 role 로만 봤다 → 등급에서 권한을 켜줘도 추이 그래프가 0 으로 내려갔다.
  if (await ctxHasPermission(ctx, "dashboard.finance")) {
    try {
      // 전년 동월 비교를 위해 24개월(표시 12 + 전년 12) 조회
      const prevStart = `${prevYm(months[0].ym)}-01`;
      const add = (ym: string, cat: "lesson" | "membership", won: number) => {
        const b = agg.get(ym) ?? empty();
        if (cat === "lesson") b.lesson += won;
        else b.membership += won;
        agg.set(ym, b);
      };

      const [sales, issuance, refunds] = await Promise.all([
        fetchSales(ctx.centerId, prevStart, months[11].end),
        fetchIssuanceSales(ctx.centerId, prevStart, months[11].end),
        fetchRefundSales(ctx.centerId, prevStart, months[11].end),
      ]);
      for (const s of sales) {
        const cat = saleCategory(s.product_type);
        if (cat !== "lesson" && cat !== "membership") continue;
        add(saleYm(s.tx_at), cat, s.amount_won);
      }
      // 원장이 못 커버하는 구간(컷오프 이후)의 발급분 — 이번달이 0 으로 보이던 원인
      for (const i of issuance) {
        if (i.category !== "lesson" && i.category !== "membership") continue;
        add(i.ymd.slice(0, 7), i.category, i.amount_won);
      }
      // 환불은 '환불한 달' 에 마이너스
      for (const r of refunds) {
        if (r.category !== "lesson" && r.category !== "membership") continue;
        add(saleYm(r.refunded_at), r.category, r.amount_won);
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
