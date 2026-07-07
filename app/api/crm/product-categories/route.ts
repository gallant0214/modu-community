import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/product-categories — 활성 종류 목록.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { data, error } = await supabase
    .from("crm_product_categories")
    .select("id, label, sort_order")
    .eq("center_id", ctx.centerId)
    .eq("status", "active")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ categories: data ?? [] });
}

/**
 * POST /api/crm/product-categories — 신규 추가.
 * body: { label }
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  let body: { label?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const label = body.label?.trim();
  if (!label) return NextResponse.json({ error: "이름을 입력해 주세요" }, { status: 400 });
  if (label.length > 40) return NextResponse.json({ error: "40자 이내" }, { status: 400 });

  const { data, error } = await supabase
    .from("crm_product_categories")
    .insert({
      center_id: ctx.centerId,
      label,
      status: "active",
    })
    .select("id, label, sort_order")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "같은 이름이 이미 있어요" }, { status: 409 });
    }
    return NextResponse.json({ error: "추가 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ category: data });
}
