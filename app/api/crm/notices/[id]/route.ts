import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/crm/notices/[id] — 공지 수정 (admin).
 * body: { title?, body?, is_published? }
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const nid = Number(id);
  if (!nid) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  let body: { title?: string; body?: string; is_published?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.title !== undefined) {
    const t = body.title.trim();
    if (!t) return NextResponse.json({ error: "제목을 입력해 주세요" }, { status: 400 });
    if (t.length > 100) return NextResponse.json({ error: "제목은 100자 이내로 입력해 주세요" }, { status: 400 });
    patch.title = t;
  }
  if (body.body !== undefined) patch.body = body.body.trim();
  if (body.is_published !== undefined) patch.is_published = !!body.is_published;

  const { error } = await supabase
    .from("crm_center_notices")
    .update(patch as never)
    .eq("id", nid)
    .eq("center_id", ctx.centerId);

  if (error) {
    return NextResponse.json({ error: "수정 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/crm/notices/[id] — 공지 삭제 (soft delete, admin).
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const nid = Number(id);
  if (!nid) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { error } = await supabase
    .from("crm_center_notices")
    .update({ status: "deleted", updated_at: new Date().toISOString() } as never)
    .eq("id", nid)
    .eq("center_id", ctx.centerId);

  if (error) {
    return NextResponse.json({ error: "삭제 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
