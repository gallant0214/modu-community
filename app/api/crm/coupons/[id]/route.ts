import { errDetail } from "@/app/lib/api-error";
import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import { validateCouponInput } from "@/app/lib/crm-coupons-db";
import { effectiveStatus } from "@/app/lib/crm-coupons";
import { ATTENDANCE_RULE_TRIGGER, TRIGGER_BY_KEY } from "@/app/lib/auto-message-triggers";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/crm/coupons/[id]
 *   { action: "archive" | "restore" }      보관/복원
 *   { ...쿠폰 필드 }                         수정
 *
 * 🚨 이미 발급된 쿠폰이 있으면 **이름·설명만** 바꿀 수 있다.
 *    혜택·조건은 사용 시점에 쿠폰 정의로 계산되므로, 바꾸면 이미 받은 회원 쿠폰의 가치가 달라진다.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "coupons.manage"))) {
    return NextResponse.json({ error: "쿠폰 관리 권한이 없습니다" }, { status: 403 });
  }
  const id = Number((await params).id);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const { data: cur } = await supabase
    .from("crm_coupons")
    .select("id, name")
    .eq("id", id)
    .eq("center_id", ctx.centerId)
    .neq("status", "deleted")
    .maybeSingle();
  if (!cur) return NextResponse.json({ error: "쿠폰을 찾을 수 없어요" }, { status: 404 });

  let patch: Record<string, unknown>;
  let action = "coupon.update";
  if (body.action === "archive" || body.action === "restore") {
    patch = { status: body.action === "archive" ? "archived" : "active" };
    action = body.action === "archive" ? "coupon.archive" : "coupon.restore";
  } else {
    const { count } = await supabase
      .from("crm_coupon_issues")
      .select("id", { count: "exact", head: true })
      .eq("coupon_id", id);
    if ((count ?? 0) > 0) {
      const name = String(body.name ?? "").trim();
      if (!name) return NextResponse.json({ error: "쿠폰 이름을 입력해 주세요" }, { status: 400 });
      patch = {
        name: name.slice(0, 40),
        description: String(body.description ?? "").trim().slice(0, 300) || null,
      };
    } else {
      const v = validateCouponInput(body);
      if (v.error) return NextResponse.json({ error: v.error }, { status: 400 });
      patch = v.row ?? {};
    }
  }

  const { error } = await supabase
    .from("crm_coupons")
    .update({ ...patch, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) return NextResponse.json({ error: "저장 실패", detail: errDetail(error) }, { status: 500 });

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action,
    entity_type: "coupon",
    entity_id: id,
    payload: { name: (cur as { name: string }).name, ...patch } as never,
  });
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/crm/coupons/[id] — 쿠폰 삭제(소프트 삭제: status 'deleted').
 *
 * 목록·보관함·발송·자동 발급에서 빠진다. 🚨 회원이 이미 받은 쿠폰은 **기한까지 그대로 쓸 수 있다**
 * (사용자 결정 2026-11-09). 그래서 행을 지우지 않는다 — 받은 쿠폰의 혜택 계산·이력에 정의가 필요하다.
 *
 * 자동 메세지에 연결된 쿠폰은 삭제하지 않는다. 지우면 그 자동 메세지가 쿠폰 없이 나간다
 * (attachAutoCoupon 은 쓸 수 없는 쿠폰이면 원문만 보낸다).
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "coupons.manage"))) {
    return NextResponse.json({ error: "쿠폰 관리 권한이 없습니다" }, { status: 403 });
  }
  const id = Number((await params).id);

  const { data: cur } = await supabase
    .from("crm_coupons")
    .select("id, name")
    .eq("id", id)
    .eq("center_id", ctx.centerId)
    .neq("status", "deleted")
    .maybeSingle();
  if (!cur) return NextResponse.json({ error: "쿠폰을 찾을 수 없어요" }, { status: 404 });

  // 자동 메세지 연결: 쿠폰 첨부(coupon_id) + 출석일수 기준 쿠폰 규칙(config.attendance_rules)
  const { data: settings } = await supabase
    .from("crm_auto_message_settings")
    .select("trigger_key, coupon_id, config")
    .eq("center_id", ctx.centerId);
  const linked = new Set<string>();
  for (const st of (settings ?? []) as { trigger_key: string; coupon_id: number | null; config: Record<string, unknown> | null }[]) {
    const rules = st.trigger_key === ATTENDANCE_RULE_TRIGGER ? st.config?.attendance_rules : null;
    const inRules = Array.isArray(rules) && rules.some((r) => Number((r as { coupon_id?: unknown }).coupon_id) === id);
    if (Number(st.coupon_id) === id || inRules) linked.add(TRIGGER_BY_KEY[st.trigger_key]?.label ?? st.trigger_key);
  }
  if (linked.size > 0) {
    const names = Array.from(linked).map((n) => `'${n}'`).join(", ");
    return NextResponse.json(
      { error: `자동 메세지 ${names}에 연결된 쿠폰이에요. 자동 메세지 설정에서 이 쿠폰을 먼저 빼 주세요.` },
      { status: 409 }
    );
  }
  const { count: pending } = await supabase
    .from("crm_auto_message_queue")
    .select("id", { count: "exact", head: true })
    .eq("center_id", ctx.centerId)
    .eq("coupon_id", id)
    .eq("status", "pending");
  if ((pending ?? 0) > 0) {
    return NextResponse.json(
      { error: `이 쿠폰을 붙여 보낼 자동 메세지 ${pending}건이 발송을 기다리고 있어요. 발송이 끝난 뒤 삭제해 주세요.` },
      { status: 409 }
    );
  }

  // 기록용 — 삭제 시점에 회원이 들고 있던(아직 쓸 수 있는) 장수
  const { data: held } = await supabase
    .from("crm_coupon_issues")
    .select("status, expires_at")
    .eq("coupon_id", id)
    .eq("status", "issued");
  const stillUsable = ((held ?? []) as { status: string; expires_at: string | null }[]).filter(
    (i) => effectiveStatus(i) === "issued"
  ).length;

  const { error } = await supabase
    .from("crm_coupons")
    .update({ status: "deleted", updated_at: new Date().toISOString() } as never)
    .eq("id", id)
    .eq("center_id", ctx.centerId);
  if (error) return NextResponse.json({ error: "삭제 실패", detail: errDetail(error) }, { status: 500 });

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "coupon.delete",
    entity_type: "coupon",
    entity_id: id,
    payload: { name: (cur as { name: string }).name, still_usable: stillUsable } as never,
  });
  return NextResponse.json({ ok: true, stillUsable });
}
