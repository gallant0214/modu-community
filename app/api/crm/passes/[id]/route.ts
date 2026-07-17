import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { loadPermissionsForRole } from "@/app/lib/crm-permissions";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/passes/[id]
 * 수강권 상세 + 회원 이름 + 수업 내역(crm_reservations).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const passId = Number(id);
  if (!passId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { data: pass, error } = await supabase
    .from("crm_passes")
    .select(
      "id, member_id, trainer_member_id, seller_member_id, issue_type, lesson_kind, total_sessions, remaining_sessions, session_minutes, price_won, vat_included, payment_method, payment_method_custom, issued_at, expires_at, status, memo, created_at"
    )
    .eq("id", passId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  if (!pass) {
    return NextResponse.json({ error: "수강권을 찾을 수 없습니다" }, { status: 404 });
  }

  // trainer/manager 는 본인 담당 또는 본인 판매만
  if (
    (ctx.role === "trainer" || ctx.role === "manager") &&
    pass.trainer_member_id !== ctx.centerMemberId &&
    pass.seller_member_id !== ctx.centerMemberId
  ) {
    return NextResponse.json({ error: "접근 권한이 없습니다" }, { status: 403 });
  }

  const [{ data: member }, { data: reservations }] = await Promise.all([
    supabase.from("crm_members").select("id, name, phone").eq("id", pass.member_id).maybeSingle(),
    supabase
      .from("crm_reservations")
      .select("id, starts_at, ends_at, status, consumed, cancelled_reason, cancelled_at")
      .eq("pass_id", passId)
      .order("starts_at", { ascending: false })
      .limit(100),
  ]);

  return NextResponse.json({ pass, member, reservations: reservations ?? [] });
}

/**
 * PATCH /api/crm/passes/[id]
 * 수강권 정보 수정 — 담당강사·수업 종류·회당 시간·메모·만료일·결제 등.
 * 권한: passes.edit (default owner/admin. 설정 > 권한에서 manager/trainer 에게 부여 가능)
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const perms = await loadPermissionsForRole(ctx.centerId, ctx.role);
  if (!perms["passes.edit"]) {
    return NextResponse.json({ error: "수강권 수정 권한이 없습니다" }, { status: 403 });
  }

  const { id } = await params;
  const passId = Number(id);
  if (!passId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  let body: {
    memo?: string;
    expires_at?: string;
    price_won?: number;
    payment_method?: string;
    payment_method_custom?: string;
    trainer_member_id?: number;
    seller_member_id?: number;
    session_minutes?: number;
    lesson_kind?: string;
    total_sessions?: number;
    remaining_sessions?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.memo !== undefined) patch.memo = body.memo?.trim() || null;
  if (body.expires_at) patch.expires_at = body.expires_at;
  if (body.price_won !== undefined && body.price_won >= 0) patch.price_won = body.price_won;
  if (body.payment_method) {
    patch.payment_method = body.payment_method;
    if (body.payment_method === "etc") {
      patch.payment_method_custom = body.payment_method_custom?.trim() || null;
    } else {
      patch.payment_method_custom = null;
    }
  }
  if (body.trainer_member_id && Number.isFinite(body.trainer_member_id)) {
    patch.trainer_member_id = Number(body.trainer_member_id);
  }
  if (body.seller_member_id && Number.isFinite(body.seller_member_id)) {
    patch.seller_member_id = Number(body.seller_member_id);
  }
  if (body.session_minutes !== undefined && body.session_minutes >= 0) {
    patch.session_minutes = Number(body.session_minutes);
  }
  if (body.lesson_kind !== undefined && typeof body.lesson_kind === "string") {
    const v = body.lesson_kind.trim();
    if (v) patch.lesson_kind = v;
  }
  if (body.total_sessions !== undefined && body.total_sessions >= 0) {
    patch.total_sessions = Number(body.total_sessions);
  }
  if (body.remaining_sessions !== undefined && body.remaining_sessions >= 0) {
    patch.remaining_sessions = Number(body.remaining_sessions);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "변경할 항목이 없습니다" }, { status: 400 });
  }

  const { error } = await supabase
    .from("crm_passes")
    .update(patch as never)
    .eq("id", passId)
    .eq("center_id", ctx.centerId);

  if (error) {
    return NextResponse.json({ error: "수정 실패", detail: error.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "pass.update",
    entity_type: "crm_passes",
    entity_id: passId,
    payload: patch as never,
  });

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/crm/passes/[id]
 * 수강권 환불 (status='refunded') — soft 처리.
 * 환불 시 잔여 예약 자동 취소는 별도 로직 필요 (1차 v1 에선 수동).
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const passId = Number(id);
  if (!passId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { error } = await supabase
    .from("crm_passes")
    .update({ status: "refunded" } as never)
    .eq("id", passId)
    .eq("center_id", ctx.centerId);

  if (error) {
    return NextResponse.json({ error: "환불 처리 실패", detail: error.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "pass.refund",
    entity_type: "pass",
    entity_id: passId,
    payload: null,
  });

  return NextResponse.json({ ok: true });
}
