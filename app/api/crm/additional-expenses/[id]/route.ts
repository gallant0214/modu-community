import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/crm/additional-expenses/[id] — 내용/금액/메모 수정 (admin).
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

  let body: { label?: string; amount_won?: number; memo?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.label !== undefined) {
    const v = body.label.trim();
    if (!v) return NextResponse.json({ error: "내용을 입력해 주세요" }, { status: 400 });
    if (v.length > 40) return NextResponse.json({ error: "내용은 40자 이내" }, { status: 400 });
    patch.label = v;
  }
  if (body.amount_won !== undefined) {
    patch.amount_won = Math.max(0, Math.floor(Number(body.amount_won) || 0));
  }
  if (body.memo !== undefined) {
    patch.memo = body.memo.trim() || null;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "변경할 항목이 없어요" }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from("crm_additional_expenses")
    .update(patch as never)
    .eq("id", expenseId)
    .eq("center_id", ctx.centerId);
  if (error) {
    return NextResponse.json({ error: "수정 실패", detail: error.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "additional_expense.update",
    entity_type: "crm_additional_expenses",
    entity_id: expenseId,
    payload: patch as never,
  });

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/crm/additional-expenses/[id] — 삭제 (admin).
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
    .from("crm_additional_expenses")
    .delete()
    .eq("id", expenseId)
    .eq("center_id", ctx.centerId);
  if (error) {
    return NextResponse.json({ error: "삭제 실패", detail: error.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "additional_expense.delete",
    entity_type: "crm_additional_expenses",
    entity_id: expenseId,
    payload: {} as never,
  });

  return NextResponse.json({ ok: true });
}
