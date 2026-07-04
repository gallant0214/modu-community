import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/lesson-kinds — 수강권 레슨 종류 목록 (활성만).
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { data, error } = await supabase
    .from("crm_lesson_kinds")
    .select("id, label, sort_order")
    .eq("center_id", ctx.centerId)
    .eq("status", "active")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ kinds: data ?? [] });
}

/**
 * POST /api/crm/lesson-kinds — 신규 추가 (admin).
 * body: { label, sort_order? }
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  let body: { label?: string; sort_order?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const label = body.label?.trim();
  if (!label) return NextResponse.json({ error: "이름을 입력해 주세요" }, { status: 400 });
  if (label.length > 30) return NextResponse.json({ error: "30자 이내" }, { status: 400 });

  const { data, error } = await supabase
    .from("crm_lesson_kinds")
    .insert({
      center_id: ctx.centerId,
      label,
      sort_order: body.sort_order ?? 100,
      status: "active",
    })
    .select("id, label, sort_order")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "같은 이름의 종류가 이미 있어요" }, { status: 409 });
    }
    return NextResponse.json({ error: "추가 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ kind: data });
}
