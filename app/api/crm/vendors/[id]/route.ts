import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/** PATCH /api/crm/vendors/[id] — 거래처 수정 (admin). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const vid = Number(id);
  if (!vid) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  let body: { name?: string; phone?: string; category?: string; memo?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const n = body.name.trim();
    if (!n) return NextResponse.json({ error: "상호를 입력해 주세요" }, { status: 400 });
    patch.name = n;
  }
  if (body.phone !== undefined) patch.phone = body.phone.trim() || null;
  if (body.category !== undefined) patch.category = body.category.trim() || null;
  if (body.memo !== undefined) patch.memo = body.memo.trim() || null;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "변경할 항목이 없습니다" }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from("crm_vendors")
    .update(patch as never)
    .eq("id", vid)
    .eq("center_id", ctx.centerId);
  if (error) {
    return NextResponse.json({ error: "수정 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** DELETE /api/crm/vendors/[id] — 거래처 삭제 (soft, admin). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const vid = Number(id);
  if (!vid) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { error } = await supabase
    .from("crm_vendors")
    .update({ status: "deleted", updated_at: new Date().toISOString() } as never)
    .eq("id", vid)
    .eq("center_id", ctx.centerId);
  if (error) {
    return NextResponse.json({ error: "삭제 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
