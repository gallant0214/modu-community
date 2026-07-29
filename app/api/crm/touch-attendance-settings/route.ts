import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

const COLUMNS = [
  "center_id",
  "msg_active_entry",
  "msg_active_entry_enabled",
  "msg_birthday_entry",
  "msg_birthday_entry_enabled",
  "msg_expiring_membership",
  "msg_expiring_membership_enabled",
  "msg_exit",
  "msg_exit_enabled",
  "msg_outstanding",
  "msg_outstanding_enabled",
  "msg_expired_membership",
  "msg_expired_membership_enabled",
  "msg_expired_rental",
  "msg_expired_rental_enabled",
  "msg_expired_locker",
  "msg_expired_locker_enabled",
  "msg_holding",
  "msg_holding_enabled",
  "msg_scheduled_membership",
  "msg_scheduled_membership_enabled",
  "photo_suggest_enabled",
  "identifier_use_number",
  "identifier_use_phone",
  "identifier_use_unified",
  "attendance_mode_enabled",
  "staff_call_enabled",
  "exit_enabled",
  "entry_reentry_minutes",
  "lesson_reentry_until_end",
  "attendance_mileage_earn",
  "expiring_threshold_days",
  "updated_at",
].join(", ");

const MSG_ENABLED_FIELDS = [
  "msg_active_entry_enabled",
  "msg_birthday_entry_enabled",
  "msg_expiring_membership_enabled",
  "msg_exit_enabled",
  "msg_outstanding_enabled",
  "msg_expired_membership_enabled",
  "msg_expired_rental_enabled",
  "msg_expired_locker_enabled",
  "msg_holding_enabled",
  "msg_scheduled_membership_enabled",
] as const;

const DEFAULTS = {
  msg_active_entry: "출석 포인트가 적립되었습니다",
  msg_active_entry_enabled: true,
  msg_birthday_entry: "생일 축하드립니다",
  msg_birthday_entry_enabled: true,
  msg_expiring_membership: "회원권이 곧 만료 예정입니다",
  msg_expiring_membership_enabled: true,
  msg_exit: "퇴실 포인트가 적립되었습니다",
  msg_exit_enabled: true,
  msg_outstanding: "",
  msg_outstanding_enabled: true,
  msg_expired_membership: "회원권이 만료되었습니다. 카운터에 문의주세요!",
  msg_expired_membership_enabled: true,
  msg_expired_rental: "운동복이 만료되었습니다. 카운터에 문의주세요!",
  msg_expired_rental_enabled: true,
  msg_expired_locker: "락커가 만료되었습니다. 카운터에 문의주세요!",
  msg_expired_locker_enabled: true,
  msg_holding: "",
  msg_holding_enabled: true,
  msg_scheduled_membership: "",
  msg_scheduled_membership_enabled: true,
  photo_suggest_enabled: true,
  identifier_use_number: true,
  identifier_use_phone: false,
  identifier_use_unified: false,
  attendance_mode_enabled: true,
  staff_call_enabled: true,
  exit_enabled: true,
  entry_reentry_minutes: 180,
  lesson_reentry_until_end: true,
  attendance_mileage_earn: 50,
  expiring_threshold_days: 5,
};

/**
 * GET — 센터의 터치출석 설정 조회. 없으면 defaults 반환.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { data, error } = await supabase
    .from("crm_touch_attendance_settings")
    .select(COLUMNS as never)
    .eq("center_id", ctx.centerId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({
    settings: data ?? { center_id: ctx.centerId, ...DEFAULTS },
  });
}

/**
 * PUT — 설정 저장 (upsert). owner/admin 만.
 */
export async function PUT(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { center_id: ctx.centerId, updated_at: new Date().toISOString() };
  // 문자열 필드
  for (const k of [
    "msg_active_entry",
    "msg_birthday_entry",
    "msg_expiring_membership",
    "msg_exit",
    "msg_outstanding",
    "msg_expired_membership",
    "msg_expired_rental",
    "msg_expired_locker",
    "msg_holding",
    "msg_scheduled_membership",
  ]) {
    if (body[k] !== undefined) patch[k] = String(body[k] ?? "").slice(0, 300);
  }
  // 불리언 (앱 동작 + 각 멘트 on/off)
  for (const k of [
    "photo_suggest_enabled",
    "identifier_use_number",
    "identifier_use_phone",
    "identifier_use_unified",
    "attendance_mode_enabled",
    "staff_call_enabled",
    "exit_enabled",
    "lesson_reentry_until_end",
    ...MSG_ENABLED_FIELDS,
  ]) {
    if (body[k] !== undefined) patch[k] = !!body[k];
  }
  // 정수
  for (const k of [
    "entry_reentry_minutes",
    "attendance_mileage_earn",
    "expiring_threshold_days",
  ]) {
    if (body[k] !== undefined) {
      patch[k] = Math.max(0, Math.min(100000, Math.floor(Number(body[k]) || 0)));
    }
  }

  const { error } = await supabase
    .from("crm_touch_attendance_settings")
    .upsert(patch as never, { onConflict: "center_id" });
  if (error) {
    return NextResponse.json({ error: "저장 실패", detail: error.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "touch_attendance.settings.update",
    entity_type: "crm_touch_attendance_settings",
    entity_id: ctx.centerId,
    payload: patch as never,
  });

  return NextResponse.json({ ok: true });
}
