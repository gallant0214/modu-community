import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/lockers/layout
 * body: { zone: number, positions: { id: number, row: number|null, col: number|null }[] }
 *
 * 지정된 zone 의 모든 락커 배치를 한 번에 저장한다.
 * row/col 이 null 이면 배치도에서 제거 (미배치 상태).
 * owner/admin 만.
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  let body: {
    zone?: number;
    positions?: { id: number; row: number | null; col: number | null }[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const zoneNumber = Number(body.zone);
  if (!Number.isInteger(zoneNumber) || zoneNumber < 1 || zoneNumber > 8) {
    return NextResponse.json({ error: "잘못된 구역 번호" }, { status: 400 });
  }
  const positions = Array.isArray(body.positions) ? body.positions : [];
  if (positions.length === 0) {
    return NextResponse.json({ error: "저장할 배치가 없어요" }, { status: 400 });
  }

  // zone 소유권 확인
  const { data: zoneRow } = await supabase
    .from("crm_locker_zones")
    .select("id")
    .eq("center_id", ctx.centerId)
    .eq("zone_number", zoneNumber)
    .maybeSingle();
  if (!zoneRow) {
    return NextResponse.json({ error: "구역을 찾을 수 없습니다" }, { status: 404 });
  }

  // 대상 락커 ids 이 이 zone 소속인지 확인
  const ids = positions.map((p) => Number(p.id)).filter((n) => Number.isInteger(n));
  const { data: myLockers } = await supabase
    .from("crm_lockers")
    .select("id")
    .eq("zone_id", zoneRow.id)
    .in("id", ids);
  const okIds = new Set((myLockers ?? []).map((l) => l.id));

  // 하나씩 업데이트 (Supabase 는 서로 다른 값의 벌크 update 를 하나의 쿼리로 못 해서 병렬 처리)
  const results = await Promise.all(
    positions
      .filter((p) => okIds.has(Number(p.id)))
      .map((p) => {
        const row = p.row === null || p.row === undefined ? null : Math.max(0, Math.floor(Number(p.row)));
        const col = p.col === null || p.col === undefined ? null : Math.max(0, Math.floor(Number(p.col)));
        return supabase
          .from("crm_lockers")
          .update({ layout_row: row, layout_col: col } as never)
          .eq("id", Number(p.id));
      })
  );
  const failed = results.filter((r) => r.error);
  if (failed.length > 0) {
    return NextResponse.json(
      { error: "일부 저장 실패", detail: failed[0].error?.message },
      { status: 500 }
    );
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "locker_layout.save",
    entity_type: "crm_locker_zones",
    entity_id: zoneNumber,
    payload: { count: positions.length } as never,
  });

  return NextResponse.json({ ok: true, updated: positions.length });
}
