import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/lockers/history?action=return|assign|move|broken|repaired|all&zone=
 *
 * 락커 사용 이력. 기본은 회수(return) 기록.
 * zone 지정 시 그 락커룸의 이력만.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  // 이력에 비밀번호 변경값(from/to)이 포함되므로 lockers.edit 권한자만
  if (!(await ctxHasPermission(ctx, "lockers.edit"))) {
    return NextResponse.json({ error: "락커 이력 열람 권한이 없습니다" }, { status: 403 });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "return";
  const zoneParam = url.searchParams.get("zone");
  const lockerId = url.searchParams.get("locker_id");

  let query = supabase
    .from("crm_locker_history")
    .select(
      "id, locker_id, zone_id, number, action, member_id, member_name, start_date, expires_at, note, changes, actor_uid, created_at"
    )
    .eq("center_id", ctx.centerId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (action !== "all") query = query.eq("action", action);

  if (zoneParam) {
    const zoneNumber = Number(zoneParam);
    const { data: zoneRow } = await supabase
      .from("crm_locker_zones")
      .select("id")
      .eq("center_id", ctx.centerId)
      .eq("zone_number", zoneNumber)
      .maybeSingle();
    if (zoneRow) query = query.eq("zone_id", zoneRow.id);
  }

  if (lockerId) {
    query = query.eq("locker_id", Number(lockerId));
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  // zone_id → zone_number/name 매핑
  const zoneIds = Array.from(new Set((data ?? []).map((d) => d.zone_id)));
  const { data: zones } = zoneIds.length
    ? await supabase
        .from("crm_locker_zones")
        .select("id, zone_number, name")
        .in("id", zoneIds)
    : { data: [] };
  const zoneMap = new Map((zones ?? []).map((z) => [z.id, z]));

  // 처리자 닉네임 매핑
  const uids = Array.from(new Set((data ?? []).map((d) => d.actor_uid)));
  const { data: nicks } = uids.length
    ? await supabase.from("nicknames").select("firebase_uid, name").in("firebase_uid", uids)
    : { data: [] };
  const nickMap = new Map((nicks ?? []).map((n) => [n.firebase_uid, n.name]));

  // 락커별 비밀번호 매핑 (회수 기록의 경우 회수 직전 비밀번호)
  // 비밀번호는 회수 시 락커에서 NULL 되니 history.note 가 없으면 빈 값.

  return NextResponse.json({
    history: (data ?? []).map((d) => ({
      ...d,
      zone_name: zoneMap.get(d.zone_id)?.name ?? `구역 ${zoneMap.get(d.zone_id)?.zone_number ?? "?"}`,
      actor_name: nickMap.get(d.actor_uid) ?? "—",
    })),
  });
}
