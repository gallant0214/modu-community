import { errDetail } from "@/app/lib/api-error";
import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission, requirePermission, permissionDeniedResponse } from "@/app/lib/crm-permissions";
import { generateApiKey, hashApiKey } from "@/app/lib/crm-api-key-auth";
import {
  API_KEY_MAX_ACTIVE,
  API_KEY_NAME_MAX,
  API_KEY_SCOPES,
  apiKeyDisplayPrefix,
  apiKeyScopeLabel,
  isApiKeyScope,
  type ApiKeyScope,
} from "@/app/lib/crm-api-keys";

export const dynamic = "force-dynamic";

/** 지금 직원이 키에 담을 수 있는 데이터 — 그 데이터의 엑셀 내보내기 권한이 있어야 한다 */
async function grantableScopes(ctx: Parameters<typeof ctxHasPermission>[0]): Promise<ApiKeyScope[]> {
  const out: ApiKeyScope[] = [];
  for (const s of API_KEY_SCOPES) if (await ctxHasPermission(ctx, s.permission)) out.push(s.key);
  return out;
}

/**
 * GET /api/crm/api-keys — 이 센터의 API 키 목록(원문·해시 없음) + 내가 담을 수 있는 데이터.
 * 권한: settings.api_keys
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  const denied = await requirePermission(ctx, "settings.api_keys");
  if (denied) return denied;

  const [{ data, error }, grantable, { data: staff }] = await Promise.all([
    supabase
      .from("crm_api_keys")
      .select("id, name, key_prefix, scopes, created_by_member_id, created_at, last_used_at, revoked_at")
      .eq("center_id", ctx.centerId)
      .order("revoked_at", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: false }),
    grantableScopes(ctx),
    supabase.from("crm_center_members").select("id, display_name").eq("center_id", ctx.centerId),
  ]);
  if (error) return NextResponse.json({ error: "조회 실패", detail: errDetail(error) }, { status: 500 });
  const nameOf = new Map((staff ?? []).map((s) => [s.id, s.display_name ?? ""]));

  return NextResponse.json({
    items: (data ?? []).map((k) => ({
      ...k,
      created_by_name: k.created_by_member_id ? nameOf.get(k.created_by_member_id) ?? null : null,
    })),
    grantable_scopes: grantable,
    max_active: API_KEY_MAX_ACTIVE,
  });
}

/**
 * POST /api/crm/api-keys { name, scopes } — 새 키 발급. 응답의 key(원문)는 이때 한 번만 준다.
 * 권한: settings.api_keys + 담는 데이터마다 엑셀 내보내기 권한(members.excel / sales.excel)
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  const denied = await requirePermission(ctx, "settings.api_keys");
  if (denied) return denied;

  let body: { name?: unknown; scopes?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "키 이름을 적어 주세요 (예: 구글 시트 매출표)" }, { status: 400 });
  if (name.length > API_KEY_NAME_MAX) {
    return NextResponse.json({ error: `키 이름은 ${API_KEY_NAME_MAX}자까지 쓸 수 있어요` }, { status: 400 });
  }
  const scopes = Array.from(new Set(Array.isArray(body.scopes) ? body.scopes.filter(isApiKeyScope) : []));
  if (!scopes.length) return NextResponse.json({ error: "볼 수 있게 할 데이터를 하나 이상 골라 주세요" }, { status: 400 });
  for (const s of scopes) {
    const perm = API_KEY_SCOPES.find((x) => x.key === s)!.permission;
    if (!(await ctxHasPermission(ctx, perm))) return permissionDeniedResponse(perm);
  }

  const { count } = await supabase
    .from("crm_api_keys")
    .select("id", { count: "exact", head: true })
    .eq("center_id", ctx.centerId)
    .is("revoked_at", null);
  if ((count ?? 0) >= API_KEY_MAX_ACTIVE) {
    return NextResponse.json(
      { error: `사용 중인 키는 ${API_KEY_MAX_ACTIVE}개까지예요. 안 쓰는 키를 폐기한 뒤 만들어 주세요.` },
      { status: 409 }
    );
  }

  // 구독 관문이 이메일 허용목록도 보므로, 키를 쓸 때 판정할 수 있게 만든 사람 이메일을 같이 둔다
  const user = await verifyAuth(request);
  const raw = generateApiKey();
  const keyPrefix = apiKeyDisplayPrefix(raw);
  const { data: row, error } = await supabase
    .from("crm_api_keys")
    .insert({
      center_id: ctx.centerId,
      name,
      key_prefix: keyPrefix,
      key_hash: hashApiKey(raw),
      scopes,
      created_by_uid: ctx.uid,
      created_by_member_id: ctx.centerMemberId,
      created_by_email: user?.email ?? null,
    })
    .select("id, name, key_prefix, scopes, created_by_member_id, created_at, last_used_at, revoked_at")
    .single();
  if (error || !row) {
    return NextResponse.json({ error: "발급 실패", detail: errDetail(error) }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "api_key.create",
    entity_type: "api_key",
    entity_id: row.id,
    payload: { name, scopes, scope_labels: scopes.map(apiKeyScopeLabel), key_prefix: keyPrefix },
  });

  return NextResponse.json({ key: raw, item: row });
}
