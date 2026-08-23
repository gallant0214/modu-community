import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ALL_PERMISSION_KEYS } from "@/app/crm/_components/role-permissions";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/grade-permissions
 * 센터의 등급별 권한 override 목록. 프론트에서 등급 base_role 기본값과 병합.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { data, error } = await supabase
    .from("crm_grade_permissions")
    .select("grade_id, permission_key, enabled")
    .eq("center_id", ctx.centerId);

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ items: data ?? [] });
}

/**
 * PATCH /api/crm/grade-permissions
 * body: { grade_id, permission_key, enabled }
 * owner base_role 등급은 언제나 true 로 고정 (변경 시도 시 무시).
 */
export async function PATCH(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "owner" });
  if (isCrmError(ctx)) return ctx;

  let body: { grade_id?: number; permission_key?: string; enabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const gradeId = Number(body.grade_id);
  const permissionKey = body.permission_key;
  if (!gradeId || !permissionKey || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "필수 항목 누락" }, { status: 400 });
  }
  if (!ALL_PERMISSION_KEYS.includes(permissionKey)) {
    return NextResponse.json({ error: "알 수 없는 권한 키" }, { status: 400 });
  }

  // 등급이 본인 센터 소속인지 + base_role 확인
  const { data: grade } = await supabase
    .from("crm_grades")
    .select("id, base_role")
    .eq("id", gradeId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!grade) {
    return NextResponse.json({ error: "등급을 찾을 수 없습니다" }, { status: 404 });
  }
  if (grade.base_role === "owner") {
    // 대표자 등급은 항상 전체 권한
    return NextResponse.json({ ok: true, ignored: true });
  }

  const { error } = await supabase
    .from("crm_grade_permissions")
    .upsert(
      {
        center_id: ctx.centerId,
        grade_id: gradeId,
        permission_key: permissionKey,
        enabled: body.enabled,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "grade_id,permission_key" }
    );

  if (error) {
    return NextResponse.json({ error: "저장 실패", detail: error.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "grade_permission.update",
    entity_type: "crm_grade_permissions",
    entity_id: gradeId,
    payload: { grade_id: gradeId, permission_key: permissionKey, enabled: body.enabled } as never,
  });

  return NextResponse.json({ ok: true });
}
