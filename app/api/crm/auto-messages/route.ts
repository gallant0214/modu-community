import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import { AUTO_MESSAGE_TRIGGER_KEYS } from "@/app/lib/auto-message-triggers";

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
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
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
    patch.send_basis = b;
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
  if (body.config !== undefined && typeof body.config === "object") patch.config = body.config;

  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("crm_auto_message_settings")
    .upsert(patch as never, { onConflict: "center_id,trigger_key" })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: "저장 실패", detail: error.message }, { status: 500 });
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
