import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { kstMonthEnd, kstMonthStart, kstPrevMonthEnd } from "@/app/lib/crm-fixed-expenses";

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

  let body: { label?: string; amount_won?: number; billing_day?: number | null; memo?: string; sort_order?: number; vat_deductible?: boolean };
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
  if (body.vat_deductible !== undefined) {
    patch.vat_deductible = body.vat_deductible === true;
  }
  if (body.sort_order !== undefined) {
    patch.sort_order = Number(body.sort_order) || 100;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "변경할 항목이 없어요" }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();

  // 현재 행 (적용 시작월 확인용)
  const { data: cur } = await supabase
    .from("crm_fixed_expenses")
    .select(
      "label, amount_won, billing_day, memo, vat_deductible, sort_order, effective_from, effective_to"
    )
    .eq("id", expenseId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!cur) return NextResponse.json({ error: "항목을 찾을 수 없습니다" }, { status: 404 });

  const monthStart = kstMonthStart();
  // 금액·세금계산서 여부는 '돈' 에 영향 → 과거 달이 다시 계산되지 않게 이력을 분리한다.
  //   기존 행: 지난달 말일까지 적용 / 새 행: 이번 달부터 새 금액
  // 단, 이번 달에 시작한 행이면 아직 과거가 없으므로 그대로 수정.
  const amountChanged =
    (patch.amount_won !== undefined && patch.amount_won !== cur.amount_won) ||
    (patch.vat_deductible !== undefined && patch.vat_deductible !== cur.vat_deductible);
  const hasPast = String(cur.effective_from) < monthStart;

  if (amountChanged && hasPast) {
    const endYmd = kstPrevMonthEnd(); // 기존 금액은 지난달까지 적용

    const { error: endErr } = await supabase
      .from("crm_fixed_expenses")
      .update({ effective_to: endYmd, status: "ended", updated_at: patch.updated_at } as never)
      .eq("id", expenseId)
      .eq("center_id", ctx.centerId);
    if (endErr) {
      return NextResponse.json({ error: "수정 실패", detail: endErr.message }, { status: 500 });
    }

    const { error: insErr } = await supabase.from("crm_fixed_expenses").insert({
      center_id: ctx.centerId,
      label: (patch.label as string) ?? cur.label,
      amount_won: (patch.amount_won as number) ?? cur.amount_won,
      billing_day: patch.billing_day !== undefined ? (patch.billing_day as number | null) : cur.billing_day,
      memo: patch.memo !== undefined ? (patch.memo as string | null) : cur.memo,
      vat_deductible:
        patch.vat_deductible !== undefined ? (patch.vat_deductible as boolean) : cur.vat_deductible,
      sort_order: (patch.sort_order as number) ?? cur.sort_order,
      status: "active",
      effective_from: monthStart,
    } as never);
    if (insErr) {
      return NextResponse.json({ error: "수정 실패", detail: insErr.message }, { status: 500 });
    }

    await supabase.from("crm_audit_logs").insert({
      center_id: ctx.centerId,
      actor_uid: ctx.uid,
      action: "fixed_expense.update",
      entity_type: "crm_fixed_expenses",
      entity_id: expenseId,
      payload: { ...patch, effective_from: monthStart, prev_ended_at: endYmd } as never,
    });
    return NextResponse.json({ ok: true, effective_from: monthStart });
  }

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
    // 완전 삭제가 아니라 '이번 달까지 적용 후 종료' — 과거 달 정산은 그대로 유지된다.
    .update({ status: "ended", effective_to: kstMonthEnd(), updated_at: new Date().toISOString() } as never)
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
