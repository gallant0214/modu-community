import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { loadPermissionsForContext } from "@/app/lib/crm-permissions";

export const dynamic = "force-dynamic";

const METHODS = ["cash", "card", "transfer", "etc"] as const;

/**
 * PATCH /api/crm/payments/[id]  — 결제내역 항목 수정 (금액/수단/결제일/메모/상태)
 * DELETE /api/crm/payments/[id] — 결제내역 항목 삭제
 * 권한: 수정=sales.edit, 삭제=sales.delete. (센터 격리)
 * 주의: 연결된 수강권/회원권의 미수금(outstanding)은 자동 재계산하지 않음(기록만 관리).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  const perms = await loadPermissionsForContext(ctx);

  const { id } = await params;
  const paymentId = Number(id) || 0;
  if (!paymentId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  let body: {
    amount_won?: number;
    method?: string;
    method_custom?: string | null;
    paid_at?: string;
    note?: string | null;
    status?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  // 권한 분기: 상태 변경(환불/취소)은 sales.refund, 그 외 필드 수정은 sales.edit
  const changingFields =
    body.amount_won !== undefined ||
    body.method !== undefined ||
    body.method_custom !== undefined ||
    body.paid_at !== undefined ||
    body.note !== undefined;
  const changingStatus = body.status !== undefined;
  if (changingFields && !perms["sales.edit"]) {
    return NextResponse.json({ error: "결제내역 수정 권한이 없습니다" }, { status: 403 });
  }
  if (changingStatus && !perms["sales.refund"] && !perms["sales.edit"]) {
    return NextResponse.json({ error: "환불 권한이 없습니다" }, { status: 403 });
  }

  const { data: cur } = await supabase
    .from("crm_payments")
    .select("id")
    .eq("id", paymentId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!cur) return NextResponse.json({ error: "결제내역을 찾을 수 없어요" }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if (body.amount_won !== undefined) {
    const n = Math.trunc(Number(body.amount_won));
    if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: "금액이 올바르지 않아요" }, { status: 400 });
    patch.amount_won = n;
  }
  if (body.method !== undefined) {
    if (!METHODS.includes(body.method as (typeof METHODS)[number])) {
      return NextResponse.json({ error: "결제 수단이 올바르지 않아요" }, { status: 400 });
    }
    patch.method = body.method;
    patch.method_custom = body.method === "etc" ? (body.method_custom?.trim() || null) : null;
  } else if (body.method_custom !== undefined) {
    patch.method_custom = body.method_custom?.trim() || null;
  }
  if (body.paid_at !== undefined && body.paid_at) {
    // 'YYYY-MM-DD' 면 KST 정오로 저장, 그 외(ISO)는 그대로.
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(body.paid_at)
      ? new Date(`${body.paid_at}T12:00:00+09:00`).toISOString()
      : new Date(body.paid_at).toISOString();
    patch.paid_at = iso;
  }
  if (body.note !== undefined) patch.note = body.note?.trim() || null;
  if (body.status !== undefined) patch.status = body.status;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase
    .from("crm_payments")
    .update(patch as never)
    .eq("id", paymentId)
    .eq("center_id", ctx.centerId);
  if (error) return NextResponse.json({ error: "수정 실패", detail: error.message }, { status: 500 });

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "payment.update",
    entity_type: "crm_payments",
    entity_id: paymentId,
    payload: patch as never,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  const perms = await loadPermissionsForContext(ctx);
  if (!perms["sales.delete"]) {
    return NextResponse.json({ error: "결제내역 삭제 권한이 없습니다" }, { status: 403 });
  }

  const { id } = await params;
  const paymentId = Number(id) || 0;
  if (!paymentId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { data: cur } = await supabase
    .from("crm_payments")
    .select("id")
    .eq("id", paymentId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!cur) return NextResponse.json({ error: "결제내역을 찾을 수 없어요" }, { status: 404 });

  const { error } = await supabase
    .from("crm_payments")
    .delete()
    .eq("id", paymentId)
    .eq("center_id", ctx.centerId);
  if (error) return NextResponse.json({ error: "삭제 실패", detail: error.message }, { status: 500 });

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "payment.delete",
    entity_type: "crm_payments",
    entity_id: paymentId,
    payload: {} as never,
  });
  return NextResponse.json({ ok: true });
}
