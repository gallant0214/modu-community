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

  let body: {
    name?: string;
    locker_count?: number;
    start_number?: number;
    layout_rows?: number;
    layout_cols?: number;
  };
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
  if (body.layout_rows !== undefined) {
    const n = Number(body.layout_rows);
    if (!Number.isInteger(n) || n < 0 || n > 40) {
      return NextResponse.json({ error: "행 수는 0~40 사이 정수" }, { status: 400 });
    }
    patch.layout_rows = n;
  }
  if (body.layout_cols !== undefined) {
    const n = Number(body.layout_cols);
    if (!Number.isInteger(n) || n < 0 || n > 40) {
      return NextResponse.json({ error: "열 수는 0~40 사이 정수" }, { status: 400 });
    }
    patch.layout_cols = n;
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
    layout_rows: 0,
    layout_cols: 0,
    ...patch,
  };
  const { error } = await supabase
    .from("crm_locker_zones")
    .upsert(baseValues as never, { onConflict: "center_id,zone_number" });

  if (error) {
    return NextResponse.json({ error: "저장 실패", detail: error.message }, { status: 500 });
  }

  // 저장된 zone 가져오기
  const { data: zoneRow } = await supabase
    .from("crm_locker_zones")
    .select("id, locker_count, start_number")
    .eq("center_id", ctx.centerId)
    .eq("zone_number", zoneNumber)
    .maybeSingle();

  if (zoneRow) {
    // 락커 갯수에 맞춰 crm_lockers row 동기화
    const targetCount = zoneRow.locker_count;
    const startNumber = zoneRow.start_number;

    const { data: lockers } = await supabase
      .from("crm_lockers")
      .select("id, number, state")
      .eq("zone_id", zoneRow.id)
      .order("number", { ascending: true });

    const existing = lockers ?? [];

    // 새로 추가할 락커
    const existingNumbers = new Set(existing.map((l) => l.number));
    const needed: { center_id: number; zone_id: number; number: number }[] = [];
    for (let i = 0; i < targetCount; i++) {
      const num = startNumber + i;
      if (!existingNumbers.has(num)) {
        needed.push({ center_id: ctx.centerId, zone_id: zoneRow.id, number: num });
      }
    }
    if (needed.length > 0) {
      await supabase.from("crm_lockers").insert(needed);
    }

    // 범위 밖 락커 중 미배정만 삭제 (배정/고장은 보호)
    const validRange = new Set<number>();
    for (let i = 0; i < targetCount; i++) validRange.add(startNumber + i);
    const removable = existing.filter(
      (l) => !validRange.has(l.number) && l.state === "unassigned"
    );
    if (removable.length > 0) {
      await supabase
        .from("crm_lockers")
        .delete()
        .in("id", removable.map((l) => l.id));
    }
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
