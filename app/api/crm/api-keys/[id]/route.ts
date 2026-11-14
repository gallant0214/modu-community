import { errDetail } from "@/app/lib/api-error";
import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { requirePermission } from "@/app/lib/crm-permissions";
import { apiKeyScopeLabel } from "@/app/lib/crm-api-keys";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/crm/api-keys/[id] — 키 폐기. 즉시 막히고 되살릴 수 없다(새로 만들어야 함).
 * 행은 지우지 않고 revoked_at 만 채운다 — 누가 언제 만들고 폐기했는지 기록으로 남긴다.
 * 권한: settings.api_keys
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  const denied = await requirePermission(ctx, "settings.api_keys");
  if (denied) return denied;

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { data: row, error } = await supabase
    .from("crm_api_keys")
    .update({ revoked_at: new Date().toISOString(), revoked_by_uid: ctx.uid })
    .eq("id", id)
    .eq("center_id", ctx.centerId)
    .is("revoked_at", null)
    .select("id, name, key_prefix, scopes")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "폐기 실패", detail: errDetail(error) }, { status: 500 });
  if (!row) return NextResponse.json({ error: "이미 폐기했거나 없는 키예요" }, { status: 404 });

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "api_key.revoke",
    entity_type: "api_key",
    entity_id: row.id,
    payload: { name: row.name, scopes: row.scopes, scope_labels: row.scopes.map(apiKeyScopeLabel), key_prefix: row.key_prefix },
  });

  return NextResponse.json({ ok: true });
}
