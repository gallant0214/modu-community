import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

function normalizeBillingDay(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 1 || n > 31) return null;
  return n;
}

/**
 * PATCH /api/crm/fixed-expenses/[id] — 항목명/금액/결제일/메모 수정 (admin).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const expenseId = Number(id);
  if (!expenseId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  let body: { label?: string; amount_won?: number; billing_day?: number | null; memo?: string; sort_order?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.label !== undefined) {
    const v = body.label.trim();
    if (!v) return NextResponse.json({ error: "항목명을 입력해 주세요" }, { status: 400 });
    if (v.length > 40) return NextResponse.json({ error: "항목명은 40자 이내" }, { status: 400 });
    patch.label = v;
  }
  if (body.amount_won !== undefined) {
    patch.amount_won = Math.max(0, Math.floor(Number(body.amount_won) || 0));
  }
  if (body.billing_day !== undefined) {
    patch.billing_day = normalizeBillingDay(body.billing_day);
  }
  if (body.memo !== undefined) {
    patch.memo = body.memo?.trim() || null;
  }
  if (body.sort_order !== undefined) {
    patch.sort_order = Number(body.sort_order) || 100;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "변경할 항목이 없어요" }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from("crm_fixed_expenses")
    .update(patch as never)
    .eq("id", expenseId)
    .eq("center_id", ctx.centerId);
  if (error) {
    return NextResponse.json({ error: "수정 실패", detail: error.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "fixed_expense.update",
    entity_type: "crm_fixed_expenses",
    entity_id: expenseId,
    payload: patch as never,
  });

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/crm/fixed-expenses/[id] — soft delete (admin).
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const expenseId = Number(id);
  if (!expenseId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { error } = await supabase
    .from("crm_fixed_expenses")
    .update({ status: "inactive", updated_at: new Date().toISOString() } as never)
    .eq("id", expenseId)
    .eq("center_id", ctx.centerId);
  if (error) {
    return NextResponse.json({ error: "삭제 실패", detail: error.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "fixed_expense.delete",
    entity_type: "crm_fixed_expenses",
    entity_id: expenseId,
    payload: {} as never,
  });

  return NextResponse.json({ ok: true });
}
