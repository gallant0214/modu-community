import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/** GET /api/crm/vendors — 센터 거래처 목록 (활성만). admin. */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { data, error } = await supabase
    .from("crm_vendors")
    .select("id, name, phone, category, memo, sort_order")
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
 * POST /api/crm/vendors — 거래처 추가 (admin).
 * body: { name(상호), phone?, category?(무슨 가게/어떤 거래), memo? }
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  let body: { name?: string; phone?: string; category?: string; memo?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "상호를 입력해 주세요" }, { status: 400 });

  const { data: created, error } = await supabase
    .from("crm_vendors")
    .insert({
      center_id: ctx.centerId,
      name,
      phone: body.phone?.trim() || null,
      category: body.category?.trim() || null,
      memo: body.memo?.trim() || null,
      created_by_uid: ctx.uid,
    })
    .select("id")
    .single();

  if (error || !created) {
    return NextResponse.json({ error: "추가 실패", detail: error?.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "vendor.create",
    entity_type: "crm_vendors",
    entity_id: created.id,
    payload: { name } as never,
  });

  return NextResponse.json({ ok: true, id: created.id });
}
