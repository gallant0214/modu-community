import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/lockers/vacant
 * 본인 센터의 모든 락커룸에서 미배정(state='unassigned') 락커 목록.
 * 회원 → 락커 배정 흐름에서 사용.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { data, error } = await supabase
    .from("crm_lockers")
    .select("id, zone_id, number, state")
    .eq("center_id", ctx.centerId)
    .eq("state", "unassigned")
    .order("number", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  const zoneIds = Array.from(new Set((data ?? []).map((d) => d.zone_id)));
  const { data: zones } = zoneIds.length
    ? await supabase
        .from("crm_locker_zones")
        .select("id, zone_number, name")
        .in("id", zoneIds)
    : { data: [] };
  const zoneMap = new Map((zones ?? []).map((z) => [z.id, z]));

  return NextResponse.json({
    lockers: (data ?? []).map((d) => ({
      id: d.id,
      zone_id: d.zone_id,
      zone_name: zoneMap.get(d.zone_id)?.name ?? "",
      zone_number: zoneMap.get(d.zone_id)?.zone_number ?? null,
      number: d.number,
    })),
  });
}
