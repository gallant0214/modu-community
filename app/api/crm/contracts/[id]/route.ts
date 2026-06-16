import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

const CATEGORIES = ["purchase", "transfer", "refund", "employment", "etc"] as const;

/**
 * GET /api/crm/contracts/[id] — 상세 (본문 포함). 모든 직원 조회 가능.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const contractId = Number(id);
  if (!contractId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { data, error } = await supabase
    .from("crm_contract_templates")
    .select("id, category, title, body, created_by_uid, created_at, updated_at, status")
    .eq("id", contractId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  if (!data || data.status !== "active") {
    return NextResponse.json({ error: "계약서를 찾을 수 없습니다" }, { status: 404 });
  }
  return NextResponse.json({ contract: data });
}

/**
 * PATCH /api/crm/contracts/[id] — 수정 (owner/admin).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const contractId = Number(id);
  if (!contractId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  let body: { title?: string; category?: string; body?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.title !== undefined) {
    const v = body.title.trim();
    if (!v) return NextResponse.json({ error: "계약서 제목을 입력해주세요" }, { status: 400 });
    patch.title = v;
  }
  if (body.category !== undefined) {
    if (!CATEGORIES.includes(body.category as (typeof CATEGORIES)[number])) {
      return NextResponse.json({ error: "카테고리 값이 잘못됨" }, { status: 400 });
    }
    patch.category = body.category;
  }
  if (body.body !== undefined) patch.body = body.body;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "변경할 항목이 없습니다" }, { status: 400 });
  }

  const { error } = await supabase
    .from("crm_contract_templates")
    .update(patch as never)
    .eq("id", contractId)
    .eq("center_id", ctx.centerId);

  if (error) {
    return NextResponse.json({ error: "수정 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/crm/contracts/[id] — soft delete (owner/admin).
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const contractId = Number(id);
  if (!contractId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { error } = await supabase
    .from("crm_contract_templates")
    .update({ status: "deleted" } as never)
    .eq("id", contractId)
    .eq("center_id", ctx.centerId);

  if (error) {
    return NextResponse.json({ error: "삭제 실패", detail: error.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "contract.delete",
    entity_type: "crm_contract_templates",
    entity_id: contractId,
    payload: null,
  });

  return NextResponse.json({ ok: true });
}
