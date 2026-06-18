import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/crm/memberships/[id] — 만료일/메모 수정. owner/admin.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const mid = Number(id);
  if (!mid) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  let body: { expires_at?: string; memo?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.expires_at) patch.expires_at = body.expires_at;
  if (body.memo !== undefined) patch.memo = body.memo?.trim() || null;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "변경할 항목이 없습니다" }, { status: 400 });
  }

  const { error } = await supabase
    .from("crm_memberships")
    .update(patch as never)
    .eq("id", mid)
    .eq("center_id", ctx.centerId);
  if (error) {
    return NextResponse.json({ error: "수정 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/crm/memberships/[id] — 환불 처리 (status='refunded'). owner/admin.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const mid = Number(id);
  if (!mid) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { error } = await supabase
    .from("crm_memberships")
    .update({ status: "refunded" } as never)
    .eq("id", mid)
    .eq("center_id", ctx.centerId);
  if (error) {
    return NextResponse.json({ error: "환불 실패", detail: error.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "membership.refund",
    entity_type: "crm_memberships",
    entity_id: mid,
    payload: null,
  });

  return NextResponse.json({ ok: true });
}
