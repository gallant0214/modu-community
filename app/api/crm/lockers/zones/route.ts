import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/lockers/zones
 * 본인 센터의 락커 구역 8개 (모든 직원 조회 가능).
 * 시드가 없는 경우(레거시 센터)는 자동 시드 후 반환.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { data, error } = await supabase
    .from("crm_locker_zones")
    .select("zone_number, name, locker_count, start_number")
    .eq("center_id", ctx.centerId)
    .order("zone_number", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  // 시드 없을 때 자동 생성
  if ((data ?? []).length === 0) {
    const seeds = Array.from({ length: 8 }, (_, i) => ({
      center_id: ctx.centerId,
      zone_number: i + 1,
      name: `구역 ${i + 1}`,
      locker_count: 0,
      start_number: 1,
    }));
    const { data: created, error: insErr } = await supabase
      .from("crm_locker_zones")
      .insert(seeds)
      .select("zone_number, name, locker_count, start_number")
      .order("zone_number", { ascending: true });
    if (insErr) {
      return NextResponse.json({ error: "초기화 실패", detail: insErr.message }, { status: 500 });
    }
    return NextResponse.json({ zones: created ?? [] });
  }

  return NextResponse.json({ zones: data });
}
