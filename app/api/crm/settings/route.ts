import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/settings
 * 본인 센터 설정. owner/admin 만 진입.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  // owner/admin, 또는 1인 강사(solo owner)만. 일반 trainer/manager 는 불가.
  if (ctx.role !== "owner" && ctx.role !== "admin" && !ctx.isSoloOwner) {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("crm_center_settings")
    .select("*")
    .eq("center_id", ctx.centerId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  // 없으면 디폴트 row 생성 (onboarding 에서 만들지만 안전망)
  if (!data) {
    const { data: created, error: insErr } = await supabase
      .from("crm_center_settings")
      .insert({ center_id: ctx.centerId })
      .select("*")
      .single();
    if (insErr) {
      return NextResponse.json({ error: "초기화 실패", detail: insErr.message }, { status: 500 });
    }
    return NextResponse.json({ settings: created });
  }

  return NextResponse.json({ settings: data });
}

/**
 * PATCH /api/crm/settings
 * 센터 설정 변경. owner/admin 만.
 */
export async function PATCH(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  // owner/admin, 또는 1인 강사(solo owner)만. 일반 trainer/manager 는 불가.
  if (ctx.role !== "owner" && ctx.role !== "admin" && !ctx.isSoloOwner) {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const allowed = [
    "cancel_enabled",
    "cancel_hours",
    "booking_enabled",
    "booking_unit_min",
    "booking_horizon_days",
    "notify_cancel",
    "notify_change",
    "notify_attend",
    "notify_register",
    "notify_pass_issue",
    "working_hours_start",
    "working_hours_end",
    "default_columns",
    "checkout_mileage_enabled",
    "checkout_mileage_earn",
  ];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) patch[key] = body[key];
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "변경할 항목이 없습니다" }, { status: 400 });
  }

  // 간단한 범위 검증
  if (patch.cancel_hours !== undefined) {
    const n = Number(patch.cancel_hours);
    if (Number.isNaN(n) || n < 0 || n > 72)
      return NextResponse.json({ error: "예약 취소 가능시간은 0~72시간" }, { status: 400 });
    patch.cancel_hours = n;
  }
  if (patch.booking_unit_min !== undefined) {
    const n = Number(patch.booking_unit_min);
    if (n !== 30 && n !== 60)
      return NextResponse.json({ error: "예약 단위는 30 또는 60분" }, { status: 400 });
    patch.booking_unit_min = n;
  }
  if (patch.booking_horizon_days !== undefined) {
    const n = Number(patch.booking_horizon_days);
    if (Number.isNaN(n) || n < 1 || n > 365)
      return NextResponse.json({ error: "예약 가능 기간은 1~365일" }, { status: 400 });
    patch.booking_horizon_days = n;
  }
  if (patch.default_columns !== undefined) {
    const n = Number(patch.default_columns);
    if (Number.isNaN(n) || n < 1 || n > 10)
      return NextResponse.json({ error: "스케줄 컬럼 수는 1~10" }, { status: 400 });
    patch.default_columns = n;
  }
  if (patch.checkout_mileage_enabled !== undefined) {
    patch.checkout_mileage_enabled = !!patch.checkout_mileage_enabled;
  }
  if (patch.checkout_mileage_earn !== undefined) {
    const n = Math.floor(Number(patch.checkout_mileage_earn));
    if (Number.isNaN(n) || n < 0 || n > 1000000)
      return NextResponse.json({ error: "퇴실 적립 마일리지는 0~1,000,000P" }, { status: 400 });
    patch.checkout_mileage_earn = n;
  }

  // upsert 패턴 (혹시 GET 한 번 안 한 케이스)
  const { error } = await supabase
    .from("crm_center_settings")
    .upsert({ center_id: ctx.centerId, ...patch } as never, { onConflict: "center_id" });

  if (error) {
    return NextResponse.json({ error: "저장 실패", detail: error.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "settings.update",
    entity_type: "center_settings",
    entity_id: ctx.centerId,
    payload: patch as never,
  });

  return NextResponse.json({ ok: true });
}
