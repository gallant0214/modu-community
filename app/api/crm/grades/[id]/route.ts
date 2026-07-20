import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/crm/grades/[id] — 등급 이름·정렬 수정.
 *  - 시스템 등급도 라벨 변경 가능
 *  - base_role 변경은 금지 (멤버 권한 게이트 깨짐 방지)
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const gradeId = Number(id);
  if (!gradeId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  let body: { label?: string; sort_order?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  // 대표자(base_role owner) 등급은 수정 불가
  const { data: target } = await supabase
    .from("crm_grades")
    .select("id, base_role")
    .eq("id", gradeId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: "등급을 찾을 수 없습니다" }, { status: 404 });
  if (target.base_role === "owner") {
    return NextResponse.json({ error: "대표자 등급은 수정할 수 없습니다" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.label !== undefined) {
    const v = body.label.trim();
    if (!v) return NextResponse.json({ error: "등급 이름을 입력해주세요" }, { status: 400 });
    patch.label = v;
  }
  if (typeof body.sort_order === "number") patch.sort_order = body.sort_order;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "변경할 항목이 없습니다" }, { status: 400 });
  }

  const { error } = await supabase
    .from("crm_grades")
    .update(patch as never)
    .eq("id", gradeId)
    .eq("center_id", ctx.centerId);

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "같은 이름의 등급이 이미 있습니다" }, { status: 409 });
    }
    return NextResponse.json({ error: "수정 실패", detail: error.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "grade.update",
    entity_type: "crm_grades",
    entity_id: gradeId,
    payload: patch as never,
  });

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/crm/grades/[id] — 커스텀 등급 삭제.
 *  - 시스템 등급 (is_system=true) 삭제 차단
 *  - 이 등급을 쓰는 멤버가 있으면 거부 (다른 등급으로 옮긴 후 삭제)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const gradeId = Number(id);
  if (!gradeId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { data: grade } = await supabase
    .from("crm_grades")
    .select("id, base_role, label")
    .eq("id", gradeId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();

  if (!grade) return NextResponse.json({ error: "등급을 찾을 수 없습니다" }, { status: 404 });
  if (grade.base_role === "owner") {
    return NextResponse.json({ error: "대표자 등급은 삭제할 수 없습니다" }, { status: 400 });
  }

  const { count } = await supabase
    .from("crm_center_members")
    .select("id", { count: "exact", head: true })
    .eq("center_id", ctx.centerId)
    .eq("grade_id", gradeId);

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: `이 등급을 쓰는 직원이 ${count}명 있습니다. 다른 등급으로 옮긴 후 다시 시도해 주세요.` },
      { status: 409 }
    );
  }

  const { error } = await supabase
    .from("crm_grades")
    .delete()
    .eq("id", gradeId)
    .eq("center_id", ctx.centerId);

  if (error) {
    return NextResponse.json({ error: "삭제 실패", detail: error.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "grade.delete",
    entity_type: "crm_grades",
    entity_id: gradeId,
    payload: { label: grade.label } as never,
  });

  return NextResponse.json({ ok: true });
}
