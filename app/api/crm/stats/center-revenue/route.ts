import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/stats/center-revenue?ym=YYYY-MM
 *
 * 센터 매출 카테고리별 합산 (이번달 발급 기준).
 *   - 회원권 (crm_memberships)
 *   - 수강권 (crm_passes) — 참고용 (스튜디오 합산)
 *   - 운동 용품 / 락커 / 기타 — 아직 매출 추적 없음 (0원)
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const ymRaw = url.searchParams.get("ym");
  const ym = /^\d{4}-\d{2}$/.test(ymRaw || "")
    ? (ymRaw as string)
    : new Date().toISOString().slice(0, 7);
  const [y, m] = ym.split("-").map(Number);
  const startDate = `${ym}-01`;
  const nextMonth = new Date(y, m, 1).toISOString().slice(0, 10);

  const [membership, pass] = await Promise.all([
    supabase
      .from("crm_memberships")
      .select("price_won")
      .eq("center_id", ctx.centerId)
      .neq("status", "deleted")
      .gte("start_date", startDate)
      .lt("start_date", nextMonth),
    supabase
      .from("crm_passes")
      .select("price_won")
      .eq("center_id", ctx.centerId)
      .neq("status", "deleted")
      .gte("issued_at", startDate)
      .lt("issued_at", nextMonth),
  ]);

  const membershipRevenue = (membership.data ?? []).reduce(
    (sum, x) => sum + (x.price_won ?? 0),
    0
  );
  const passRevenue = (pass.data ?? []).reduce((sum, x) => sum + (x.price_won ?? 0), 0);
  const lockerRevenue = 0;
  const goodsRevenue = 0;
  const etcRevenue = 0;
  const total = membershipRevenue + passRevenue + lockerRevenue + goodsRevenue + etcRevenue;

  return NextResponse.json({
    ym,
    total,
    counts: {
      memberships: membership.data?.length ?? 0,
      passes: pass.data?.length ?? 0,
    },
    categories: {
      membership: membershipRevenue,
      pass: passRevenue,
      locker: lockerRevenue,
      goods: goodsRevenue,
      etc: etcRevenue,
    },
  });
}
