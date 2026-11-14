import "server-only";
import { createHash, randomInt } from "crypto";
import { NextResponse, after } from "next/server";
import { supabase } from "./supabase";
import { loadCrmContextForUid } from "./crm-auth";
import { ctxHasPermission } from "./crm-permissions";
import { crmAccessState, SUBSCRIPTION_BLOCKED_MESSAGE } from "./saas-subscription";
import { authFailureCount, checkRateLimit, getClientIp, recordAuthFailure } from "./security";
import {
  API_KEY_PREFIX,
  API_KEY_RANDOM_LEN,
  API_KEY_SCOPES,
  apiKeyScopeLabel,
  extractApiKey,
  isApiKeyFormat,
  isApiKeyScope,
  type ApiKeyScope,
} from "./crm-api-keys";

const BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** 새 키 원문 — 화면에 한 번만 보여 주고 저장하지 않는다 */
export function generateApiKey(): string {
  let s = API_KEY_PREFIX;
  for (let i = 0; i < API_KEY_RANDOM_LEN; i++) s += BASE62[randomInt(BASE62.length)];
  return s;
}

/** DB 에는 이 값만 저장 (SHA-256 hex) */
export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export interface ApiKeyContext {
  keyId: number;
  keyName: string;
  centerId: number;
  centerName: string;
  scopes: ApiKeyScope[];
}

/** 같은 IP 에서 1분에 이만큼 틀리면 잠시 막는다 */
const FAIL_LIMIT_PER_MIN = 20;
/** 마지막 사용 시각은 1분에 한 번만 갱신 (시트 새로고침마다 쓰기 방지) */
const TOUCH_INTERVAL_MS = 60_000;

const err = (status: number, error: string, code: string) =>
  NextResponse.json({ error, code }, { status, headers: { "Cache-Control": "no-store" } });

/**
 * 외부 연동 API 관문 — 모든 /api/open/v1/* 가 이 함수를 지난다.
 *
 * 통과 조건 (하나라도 아니면 거부):
 *  1. 키 형식·해시 일치, 폐기 안 됨
 *  2. 키 만든 직원이 아직 그 센터의 활성 직원 (퇴사하면 키도 막힘)
 *  3. 센터 CRM 이용권 (requireCrmContext 와 같은 구독 관문)
 *  4. 그 직원에게 'API 키 발급' 권한 + 요청한 데이터의 엑셀 내보내기 권한이 지금도 있음
 *  5. 키에 그 데이터(scope)가 허용돼 있음
 *
 * @param scope null = 연결 확인(데이터 없음)
 */
export async function requireApiKey(
  request: Request,
  scope: ApiKeyScope | null
): Promise<NextResponse | ApiKeyContext> {
  const ip = getClientIp(request);
  if ((await authFailureCount("open-api", ip)) >= FAIL_LIMIT_PER_MIN) {
    return err(429, "잘못된 키로 너무 많이 요청했어요. 1분 뒤 다시 시도해 주세요.", "TOO_MANY_FAILURES");
  }

  const raw = extractApiKey(request.headers, request.url);
  if (!raw) {
    return err(401, "API 키가 필요해요. 주소 끝에 &key=발급받은키 를 붙이거나 Authorization: Bearer 헤더로 보내 주세요.", "MISSING_KEY");
  }
  if (!isApiKeyFormat(raw)) {
    await recordAuthFailure("open-api", ip);
    return err(401, "API 키 형식이 올바르지 않아요. 발급받은 키를 그대로 붙여 넣어 주세요.", "INVALID_KEY");
  }

  const { data: key } = await supabase
    .from("crm_api_keys")
    .select("id, name, center_id, scopes, created_by_uid, created_by_email, revoked_at, last_used_at")
    .eq("key_hash", hashApiKey(raw))
    .maybeSingle();
  if (!key) {
    await recordAuthFailure("open-api", ip);
    return err(401, "등록되지 않은 API 키예요.", "INVALID_KEY");
  }
  if (key.revoked_at) {
    return err(401, "폐기된 API 키예요. CRM 설정 → API 연동에서 새 키를 만들어 주세요.", "REVOKED_KEY");
  }

  const limited = await checkRateLimit(`apikey:${key.id}`, "read");
  if (limited) return limited;

  const ctx = await loadCrmContextForUid(key.created_by_uid, key.center_id);
  if (!ctx || ctx.centerId !== key.center_id) {
    return err(403, "이 키를 만든 직원이 더 이상 센터 직원이 아니라 사용할 수 없어요. 새 키를 만들어 주세요.", "CREATOR_INACTIVE");
  }

  const sub = await crmAccessState({ uid: ctx.uid, centerId: ctx.centerId, email: key.created_by_email });
  if (!sub.allowed) {
    return err(402, SUBSCRIPTION_BLOCKED_MESSAGE[sub.reason] ?? "센터 CRM 이용권이 필요합니다", "SUBSCRIPTION_REQUIRED");
  }

  if (!(await ctxHasPermission(ctx, "settings.api_keys"))) {
    return err(403, "키를 만든 직원의 'API 키 발급' 권한이 꺼져 있어 사용할 수 없어요.", "PERMISSION_OFF");
  }

  const scopes = (key.scopes ?? []).filter(isApiKeyScope);
  if (scope) {
    if (!scopes.includes(scope)) {
      return err(403, `이 키로는 '${apiKeyScopeLabel(scope)}' 데이터를 볼 수 없어요.`, "SCOPE_NOT_ALLOWED");
    }
    const perm = API_KEY_SCOPES.find((s) => s.key === scope)!.permission;
    if (!(await ctxHasPermission(ctx, perm))) {
      return err(403, `키를 만든 직원의 '${apiKeyScopeLabel(scope)}' 엑셀 내보내기 권한이 꺼져 있어 사용할 수 없어요.`, "PERMISSION_OFF");
    }
  }

  const lastUsed = key.last_used_at ? new Date(key.last_used_at).getTime() : 0;
  if (Date.now() - lastUsed > TOUCH_INTERVAL_MS) {
    after(async () => {
      await supabase
        .from("crm_api_keys")
        .update({ last_used_at: new Date().toISOString(), last_used_ip: ip.slice(0, 64) })
        .eq("id", key.id);
    });
  }

  return { keyId: key.id, keyName: key.name, centerId: ctx.centerId, centerName: ctx.centerName, scopes };
}
