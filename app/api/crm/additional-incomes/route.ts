import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/additional-incomes?ym=YYYY-MM — 해당 월의 추가 수입 목록. admin.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const ymRaw = url.searchParams.get("ym");
  const ym = /^\d{4}-\d{2}$/.test(ymRaw || "")
    ? (ymRaw as string)
    : new Date().toISOString().slice(0, 7);

  const { data, error } = await supabase
    .from("crm_additional_incomes")
    .select("id, ym, label, amount_won, memo")
    .eq("center_id", ctx.centerId)
    .eq("ym", ym)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ym, items: data ?? [] });
}

/**
 * POST /api/crm/additional-incomes — 추가 (admin).
 * body: { ym, label, amount_won, memo? }
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  let body: { ym?: string; label?: string; amount_won?: number; memo?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const ym = body.ym;
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) {
    return NextResponse.json({ error: "귀속 월(YYYY-MM)이 잘못됨" }, { status: 400 });
  }
  const label = body.label?.trim();
  if (!label) return NextResponse.json({ error: "내용을 입력해 주세요" }, { status: 400 });
  if (label.length > 40) return NextResponse.json({ error: "내용은 40자 이내" }, { status: 400 });

  const amount = Math.max(0, Math.floor(Number(body.amount_won) || 0));

  const { data, error } = await supabase
    .from("crm_additional_incomes")
    .insert({
      center_id: ctx.centerId,
      ym,
      label,
      amount_won: amount,
      memo: body.memo?.trim() || null,
    })
    .select("id, ym, label, amount_won, memo")
    .single();

  if (error) {
    return NextResponse.json({ error: "추가 실패", detail: error.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "additional_income.create",
    entity_type: "crm_additional_incomes",
    entity_id: data.id,
    payload: { ym, label, amount_won: amount } as never,
  });

  return NextResponse.json({ item: data });
}
