import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/role-permissions
 * 센터의 저장된 권한 override 목록. 프론트에서 defaults 와 병합.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { data, error } = await supabase
    .from("crm_role_permissions")
    .select("role_key, permission_key, enabled")
    .eq("center_id", ctx.centerId);

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ items: data ?? [] });
}

/**
 * PATCH /api/crm/role-permissions
 * body: { role_key, permission_key, enabled }
 * owner 역할은 언제나 true 로 고정 (변경 시도 시 무시).
 */
export async function PATCH(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  let body: { role_key?: string; permission_key?: string; enabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const roleKey = body.role_key;
  const permissionKey = body.permission_key;
  if (!roleKey || !permissionKey || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "필수 항목 누락" }, { status: 400 });
  }
  if (roleKey === "owner") {
    // owner 는 항상 활성
    return NextResponse.json({ ok: true, ignored: true });
  }

  const { error } = await supabase
    .from("crm_role_permissions")
    .upsert(
      {
        center_id: ctx.centerId,
        role_key: roleKey,
        permission_key: permissionKey,
        enabled: body.enabled,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "center_id,role_key,permission_key" }
    );

  if (error) {
    return NextResponse.json({ error: "저장 실패", detail: error.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "role_permission.update",
    entity_type: "crm_role_permissions",
    entity_id: 0,
    payload: { role_key: roleKey, permission_key: permissionKey, enabled: body.enabled } as never,
  });

  return NextResponse.json({ ok: true });
}
