import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/lockers?zone=<zone_number>
 * 해당 락커룸의 락커 + 회원 정보. 모든 직원 조회 가능.
 *
 * 동적 상태 계산은 클라이언트에서 (오늘 vs expires_at).
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const zoneNumber = Number(url.searchParams.get("zone") || "1");
  if (!Number.isInteger(zoneNumber) || zoneNumber < 1 || zoneNumber > 8) {
    return NextResponse.json({ error: "잘못된 구역" }, { status: 400 });
  }

  const { data: zoneRow } = await supabase
    .from("crm_locker_zones")
    .select("id, name, locker_count, start_number")
    .eq("center_id", ctx.centerId)
    .eq("zone_number", zoneNumber)
    .maybeSingle();

  if (!zoneRow) {
    return NextResponse.json({ zone: null, lockers: [] });
  }

  const { data: lockers, error } = await supabase
    .from("crm_lockers")
    .select(
      "id, number, state, assigned_member_id, start_date, expires_at, password, memo, updated_at"
    )
    .eq("zone_id", zoneRow.id)
    .order("number", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  // 회원 이름 join
  const memberIds = Array.from(
    new Set(
      (lockers ?? [])
        .map((l) => l.assigned_member_id)
        .filter((v): v is number => !!v)
    )
  );
  const { data: members } = memberIds.length
    ? await supabase.from("crm_members").select("id, name, phone").in("id", memberIds)
    : { data: [] };
  const memberMap = new Map((members ?? []).map((m) => [m.id, m]));

  return NextResponse.json({
    zone: zoneRow,
    lockers: (lockers ?? []).map((l) => ({
      ...l,
      member: l.assigned_member_id ? memberMap.get(l.assigned_member_id) ?? null : null,
    })),
  });
}
