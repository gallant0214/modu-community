import { errDetail } from "@/app/lib/api-error";
import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import {
  AUTO_MESSAGE_TRIGGER_KEYS,
  coerceSendBasis,
  defaultSendDays,
} from "@/app/lib/auto-message-triggers";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/auto-messages
 * 센터의 자동 메세지 트리거별 설정 목록. owner/admin 만.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "messages.auto_edit"))) {
    return NextResponse.json({ error: "자동 메세지 권한이 없습니다" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("crm_auto_message_settings")
    .select("*")
    .eq("center_id", ctx.centerId);

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: errDetail(error) }, { status: 500 });
  }
  return NextResponse.json({ settings: data ?? [] });
}

/**
 * PATCH /api/crm/auto-messages
 * 트리거 1개 설정 저장(upsert). owner/admin 만.
 * body: { trigger_key, enabled?, name?, send_basis?, send_days?, send_count?,
 *         methods?, audience?, message_body?, coupon_id?, config? }
 */
export async function PATCH(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "messages.auto_edit"))) {
    return NextResponse.json({ error: "자동 메세지 권한이 없습니다" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const triggerKey = typeof body.trigger_key === "string" ? body.trigger_key : "";
  if (!AUTO_MESSAGE_TRIGGER_KEYS.has(triggerKey)) {
    return NextResponse.json({ error: "알 수 없는 트리거" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { center_id: ctx.centerId, trigger_key: triggerKey };

  if (body.enabled !== undefined) patch.enabled = !!body.enabled;
  if (body.name !== undefined) patch.name = String(body.name).slice(0, 100);
  if (body.send_basis !== undefined) {
    const b = String(body.send_basis);
    if (!["immediate", "schedule", "count"].includes(b)) {
      return NextResponse.json({ error: "잘못된 전송 기준" }, { status: 400 });
    }
    // 🚨 트리거가 허용하지 않는 기준은 저장하지 않는다.
    //   예전엔 '출석일수 쿠폰'(일정 기준 전용)이 immediate 로 저장돼
    //   '만료 7일 전'이 아니라 '만료 당일'에 발송되는 상태로 굳어 있었다.
    patch.send_basis = coerceSendBasis(triggerKey, b);
  }
  if (body.send_days !== undefined) {
    patch.send_days = body.send_days === null ? null : Math.max(0, Math.floor(Number(body.send_days) || 0));
  }
  if (body.send_count !== undefined) {
    patch.send_count = body.send_count === null ? null : Math.max(0, Math.floor(Number(body.send_count) || 0));
  }
  if (body.methods !== undefined && Array.isArray(body.methods)) {
    const allowed = ["sms", "push", "smart", "alimtalk"];
    patch.methods = (body.methods as unknown[]).map(String).filter((m) => allowed.includes(m));
  }
  if (body.audience !== undefined && Array.isArray(body.audience)) {
    patch.audience = (body.audience as unknown[]).slice(0, 3);
  }
  if (body.message_body !== undefined) patch.message_body = String(body.message_body).slice(0, 4000);
  if (body.coupon_id !== undefined) patch.coupon_id = body.coupon_id === null ? null : Number(body.coupon_id);

  patch.updated_at = new Date().toISOString();

  // 목록에서 스위치만 켜는 저장(enabled 만 전달)도 들어온다 → 기준·일수가 비면 여기서 메꾼다.
  // DB 기본값은 'immediate' 라서, 일정 기준 전용 트리거가 '당일 발송'으로 만들어지는 걸 막는다.
  const { data: before } = await supabase
    .from("crm_auto_message_settings")
    .select("send_basis, send_days, config")
    .eq("center_id", ctx.centerId)
    .eq("trigger_key", triggerKey)
    .maybeSingle();
  const prev = before as
    | { send_basis?: string | null; send_days?: number | null; config?: Record<string, unknown> | null }
    | null;
  // 🚨 config 는 기존 값에 **덮어 합친다**(최상위 키 단위). 통째로 바꾸면 배포 전에 열어 둔 화면에서
  //    저장할 때, 그 화면이 모르는 새 설정(예: exclude_zero_attendance)이 조용히 지워진다
  //    (2026-11-09 출석일수 쿠폰 '출석 0일 제외'가 이렇게 꺼졌다).
  if (body.config !== undefined && body.config !== null && typeof body.config === "object" && !Array.isArray(body.config)) {
    const prevConfig = prev?.config && typeof prev.config === "object" ? prev.config : {};
    patch.config = { ...prevConfig, ...(body.config as Record<string, unknown>) };
  }
  if (patch.send_basis === undefined) {
    const fixed = coerceSendBasis(triggerKey, prev?.send_basis);
    if (fixed !== prev?.send_basis) patch.send_basis = fixed;
  }
  const finalBasis = (patch.send_basis as string | undefined) ?? prev?.send_basis ?? "immediate";
  if (finalBasis === "schedule") {
    const days = (patch.send_days as number | null | undefined) ?? prev?.send_days ?? null;
    if (days === null) patch.send_days = defaultSendDays(triggerKey);
  }

  const { data, error } = await supabase
    .from("crm_auto_message_settings")
    .upsert(patch as never, { onConflict: "center_id,trigger_key" })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: "저장 실패", detail: errDetail(error) }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "auto_message.update",
    entity_type: "auto_message_setting",
    entity_id: (data as { id: number }).id,
    payload: { trigger_key: triggerKey, enabled: patch.enabled } as never,
  });

  return NextResponse.json({ setting: data });
}
