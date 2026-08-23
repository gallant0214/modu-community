import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/contracts/sign/[id]
 * 서명된 계약서 단일 상세 (서명 PNG 포함).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const cid = Number(id);
  if (!cid) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { data, error } = await supabase
    .from("crm_signed_contracts")
    .select("*")
    .eq("id", cid)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "계약서를 찾을 수 없습니다" }, { status: 404 });
  // 직원 계약서는 staff_contracts.view, 회원 계약서는 contracts.member_edit 권한 필요
  const needKey = (data as { staff_member_id: number | null }).staff_member_id
    ? "staff_contracts.view"
    : "contracts.member_edit";
  if (!(await ctxHasPermission(ctx, needKey))) {
    return NextResponse.json({ error: "계약서 열람 권한이 없습니다" }, { status: 403 });
  }
  return NextResponse.json({ contract: data });
}

/**
 * DELETE /api/crm/contracts/sign/[id]
 * 무효화 처리 (실제 삭제 대신 status=voided).
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const cid = Number(id);
  if (!cid) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { error } = await supabase
    .from("crm_signed_contracts")
    .update({ status: "voided" } as never)
    .eq("id", cid)
    .eq("center_id", ctx.centerId);
  if (error) {
    return NextResponse.json({ error: "무효화 실패", detail: error.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "contract.void",
    entity_type: "crm_signed_contracts",
    entity_id: cid,
  });

  return NextResponse.json({ ok: true });
}
