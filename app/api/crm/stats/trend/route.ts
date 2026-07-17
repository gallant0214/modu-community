import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/stats/trend
 * 최근 12개월 PT/이용권 매출 추이 (대시보드용, PDF 1-1).
 *
 * 응답: [{ ym: "2026-01", revenue: 1000000, membershipRevenue: 500000 }, ...] 12개
 *
 * trainer/manager 는 본인 발급분만.
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

  let passQuery = supabase
    .from("crm_passes")
    .select("price_won, issued_at, trainer_member_id, seller_member_id")
    .eq("center_id", ctx.centerId)
    .gte("issued_at", months[0].start)
    .lt("issued_at", months[11].end);

  if (ctx.role === "trainer" || ctx.role === "manager") {
    passQuery = passQuery.or(
      `trainer_member_id.eq.${ctx.centerMemberId},seller_member_id.eq.${ctx.centerMemberId}`
    );
  }

  let membershipQuery = supabase
    .from("crm_memberships")
    .select("price_won, start_date, seller_member_id, status")
    .eq("center_id", ctx.centerId)
    .neq("status", "deleted")
    .gte("start_date", months[0].start)
    .lt("start_date", months[11].end);

  if (ctx.role === "trainer" || ctx.role === "manager") {
    membershipQuery = membershipQuery.eq("seller_member_id", ctx.centerMemberId);
  }

  const [passes, memberships] = await Promise.all([passQuery, membershipQuery]);
  if (passes.error) {
    return NextResponse.json({ error: "조회 실패", detail: passes.error.message }, { status: 500 });
  }
  if (memberships.error) {
    return NextResponse.json({ error: "조회 실패", detail: memberships.error.message }, { status: 500 });
  }

  (passes.data ?? []).forEach((p) => {
    const ym = (p.issued_at as string).slice(0, 7);
    const bucket = months.find((m) => m.ym === ym);
    if (bucket) bucket.revenue += p.price_won ?? 0;
  });

  (memberships.data ?? []).forEach((m) => {
    const ym = (m.start_date as string).slice(0, 7);
    const bucket = months.find((month) => month.ym === ym);
    if (bucket) bucket.membershipRevenue += m.price_won ?? 0;
  });

  return NextResponse.json({
    months: months.map(({ ym, revenue, membershipRevenue }) => ({ ym, revenue, membershipRevenue })),
  });
}
