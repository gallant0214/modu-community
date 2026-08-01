import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/** 단일 상담지 템플릿 조회 (에디터용). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const tid = Number(id);
  if (!tid) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { data, error } = await supabase
    .from("crm_consultation_templates")
    .select("id, center_id, name, description, is_default, sort_order, active, definition, created_at, updated_at")
    .eq("id", tid)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "템플릿을 찾을 수 없습니다" }, { status: 404 });
  return NextResponse.json({ template: data });
}

/**
 * PATCH — 이름/설명/기본템플릿 변경, 정렬 변경, definition 갱신.
 * body: { name?, description?, is_default?, sort_order?, definition? }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const tid = Number(id);
  if (!tid) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  let body: {
    name?: string;
    description?: string | null;
    is_default?: boolean;
    sort_order?: number;
    definition?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === "string") {
    const n = body.name.trim();
    if (!n) return NextResponse.json({ error: "이름은 비울 수 없어요" }, { status: 400 });
    patch.name = n;
  }
  if (body.description !== undefined) {
    patch.description = typeof body.description === "string" ? body.description.trim() || null : null;
  }
  if (typeof body.sort_order === "number") patch.sort_order = Math.floor(body.sort_order);
  if (body.definition !== undefined) {
    patch.definition =
      body.definition && typeof body.definition === "object" ? body.definition : {};
  }

  // is_default 를 true 로 바꾸면 다른 템플릿의 is_default 해제
  if (body.is_default === true) {
    await supabase
      .from("crm_consultation_templates")
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq("center_id", ctx.centerId)
      .neq("id", tid);
    patch.is_default = true;
  } else if (body.is_default === false) {
    patch.is_default = false;
  }

  const { error } = await supabase
    .from("crm_consultation_templates")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(patch as any)
    .eq("id", tid)
    .eq("center_id", ctx.centerId);
  if (error) {
    return NextResponse.json({ error: "저장 실패", detail: error.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "consultation_template.update",
    entity_type: "crm_consultation_templates",
    entity_id: tid,
    payload: patch as never,
  });

  return NextResponse.json({ ok: true });
}

/**
 * DELETE — soft delete (active=false). 완전 삭제 X.
 * 기본 템플릿이면 삭제 불가.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const tid = Number(id);
  if (!tid) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { data: cur } = await supabase
    .from("crm_consultation_templates")
    .select("id, is_default")
    .eq("id", tid)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!cur) return NextResponse.json({ error: "템플릿을 찾을 수 없습니다" }, { status: 404 });
  if (cur.is_default) {
    return NextResponse.json(
      { error: "기본 템플릿은 삭제할 수 없어요. 다른 템플릿을 기본으로 지정한 뒤 삭제해 주세요." },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("crm_consultation_templates")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", tid)
    .eq("center_id", ctx.centerId);
  if (error) {
    return NextResponse.json({ error: "삭제 실패", detail: error.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "consultation_template.delete",
    entity_type: "crm_consultation_templates",
    entity_id: tid,
    payload: {} as never,
  });

  return NextResponse.json({ ok: true });
}
