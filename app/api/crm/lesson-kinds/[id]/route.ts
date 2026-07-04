import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/crm/lesson-kinds/[id] — 라벨/순서 수정 (admin).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const kindId = Number(id);
  if (!kindId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  let body: { label?: string; sort_order?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.label !== undefined) {
    const v = body.label.trim();
    if (!v) return NextResponse.json({ error: "이름을 입력해 주세요" }, { status: 400 });
    patch.label = v;
  }
  if (body.sort_order !== undefined) {
    patch.sort_order = Number(body.sort_order) || 100;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "변경할 항목이 없어요" }, { status: 400 });
  }

  const { error } = await supabase
    .from("crm_lesson_kinds")
    .update(patch as never)
    .eq("id", kindId)
    .eq("center_id", ctx.centerId);
  if (error) {
    return NextResponse.json({ error: "수정 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/crm/lesson-kinds/[id] — soft delete (admin).
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const kindId = Number(id);
  if (!kindId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { error } = await supabase
    .from("crm_lesson_kinds")
    .update({ status: "inactive" } as never)
    .eq("id", kindId)
    .eq("center_id", ctx.centerId);
  if (error) {
    return NextResponse.json({ error: "삭제 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
