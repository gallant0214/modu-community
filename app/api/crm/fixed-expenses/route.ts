import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/** 결제일 정규화 (1~31 또는 null) */
function normalizeBillingDay(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 1 || n > 31) return null;
  return n;
}

/**
 * GET /api/crm/fixed-expenses — 센터 고정 지출 목록 (활성만). admin.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { data, error } = await supabase
    .from("crm_fixed_expenses")
    .select("id, label, amount_won, billing_day, memo, sort_order")
    .eq("center_id", ctx.centerId)
    .eq("status", "active")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ items: data ?? [] });
}

/**
 * POST /api/crm/fixed-expenses — 신규 추가 (admin).
 * body: { label, amount_won, billing_day?, memo? }
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  let body: { label?: string; amount_won?: number; billing_day?: number | null; memo?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const label = body.label?.trim();
  if (!label) return NextResponse.json({ error: "항목명을 입력해 주세요" }, { status: 400 });
  if (label.length > 40) return NextResponse.json({ error: "항목명은 40자 이내" }, { status: 400 });

  const amount = Math.max(0, Math.floor(Number(body.amount_won) || 0));

  const { data, error } = await supabase
    .from("crm_fixed_expenses")
    .insert({
      center_id: ctx.centerId,
      label,
      amount_won: amount,
      billing_day: normalizeBillingDay(body.billing_day),
      memo: body.memo?.trim() || null,
      status: "active",
    })
    .select("id, label, amount_won, billing_day, memo, sort_order")
    .single();

  if (error) {
    return NextResponse.json({ error: "추가 실패", detail: error.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "fixed_expense.create",
    entity_type: "crm_fixed_expenses",
    entity_id: data.id,
    payload: { label, amount_won: amount } as never,
  });

  return NextResponse.json({ item: data });
}
