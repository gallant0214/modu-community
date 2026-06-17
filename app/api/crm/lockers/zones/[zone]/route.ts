import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

const ZONE_NAME_MAX = 6;

/**
 * PATCH /api/crm/lockers/zones/[zone]
 *   zone: 1~8
 * body: { name?, locker_count?, start_number? }
 *
 * owner/admin 만 수정.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ zone: string }> }
) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { zone } = await params;
  const zoneNumber = Number(zone);
  if (!Number.isInteger(zoneNumber) || zoneNumber < 1 || zoneNumber > 8) {
    return NextResponse.json({ error: "잘못된 구역 번호" }, { status: 400 });
  }

  let body: { name?: string; locker_count?: number; start_number?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const v = body.name.trim();
    if (!v) return NextResponse.json({ error: "구역명을 입력해주세요" }, { status: 400 });
    if (v.length > ZONE_NAME_MAX) {
      return NextResponse.json({ error: `구역명은 ${ZONE_NAME_MAX}자 이내` }, { status: 400 });
    }
    patch.name = v;
  }
  if (body.locker_count !== undefined) {
    const n = Number(body.locker_count);
    if (!Number.isInteger(n) || n < 0) {
      return NextResponse.json({ error: "락커 갯수는 0 이상의 정수" }, { status: 400 });
    }
    patch.locker_count = n;
  }
  if (body.start_number !== undefined) {
    const n = Number(body.start_number);
    if (!Number.isInteger(n) || n < 1) {
      return NextResponse.json({ error: "시작 번호는 1 이상의 정수" }, { status: 400 });
    }
    patch.start_number = n;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "변경할 항목이 없습니다" }, { status: 400 });
  }

  // upsert (시드 없는 케이스 안전망)
  const baseValues = {
    center_id: ctx.centerId,
    zone_number: zoneNumber,
    name: `구역 ${zoneNumber}`,
    locker_count: 0,
    start_number: 1,
    ...patch,
  };
  const { error } = await supabase
    .from("crm_locker_zones")
    .upsert(baseValues as never, { onConflict: "center_id,zone_number" });

  if (error) {
    return NextResponse.json({ error: "저장 실패", detail: error.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "locker_zone.update",
    entity_type: "crm_locker_zones",
    entity_id: zoneNumber,
    payload: patch as never,
  });

  return NextResponse.json({ ok: true });
}
