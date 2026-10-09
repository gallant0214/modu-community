import "server-only";
import { supabase } from "@/app/lib/supabase";
import {
  accessStateFor,
  subscriptionEnforcedForUid,
  type CrmAccessState,
} from "@/app/lib/saas-access-policy";

/**
 * 센터 CRM 구독 **조회** — DB 를 보는 부분.
 *
 * 판정 규칙 자체는 `saas-access-policy.ts` 에 있다(테스트가 그 파일을 직접 불러
 * 실제 코드를 검증한다). 여기서는 행을 가져와 그 규칙에 넘기는 일만 한다.
 *
 * 🚨 **구독 게이트를 권한 시스템(crm-permissions.ts)에 넣으면 안 된다.**
 *    `owner` 와 `is_solo_owner` 는 세 겹으로 전부 통과한다
 *    (`loadPermissionsForRole`, `loadPermissionsForGrade`, `ctxHasPermission`).
 *    정작 돈을 내는 사람이 사장님(owner)이라, 권한 안에 넣으면 아무도 막히지 않는다.
 *    그래서 `requireCrmContext()` 가 이 모듈을 직접 호출한다.
 */

// 정책 함수들은 그대로 다시 내보낸다 — 호출부가 두 파일을 모두 알 필요가 없다
export {
  subscriptionEnforcedUids,
  subscriptionEnforcedForUid,
  isSubscriptionLive,
  accessStateFor,
  SUBSCRIPTION_BLOCKED_MESSAGE,
  saasSalesEnabled,
  saasSalesAllowedForUid,
  saasPgProvider,
  SAAS_SALES_DISABLED_MESSAGE,
  SAAS_ORDER_TTL_MINUTES,
} from "@/app/lib/saas-access-policy";
export type { CrmAccessState, AccessReason, SaasPgProvider } from "@/app/lib/saas-access-policy";

export interface SaasSubscription {
  id: number;
  center_id: number;
  firebase_uid: string;
  plan_code: string;
  status: string;
  started_on: string;
  expires_on: string;
  billing_key: string | null;
}

/**
 * 센터의 **현재 구독 행**. 만료됐어도 돌려준다.
 *
 * `status` 의 뜻을 헷갈리지 말 것:
 *   active   — 현재 구독 행. **만료 여부와 무관하다.** 재결제 시 이 행의 expires_on 을 늘린다
 *   canceled — 환불 등으로 무효가 된 구독
 *   expired  — 사람이 직접 회수한 구독
 * 접근 허용은 `status === 'active' && 오늘 <= expires_on` 로 판단한다.
 * (만료됐다고 status 를 자동으로 바꾸지 않는다 — 조회할 때 쓰기가 일어나면 읽기 경로에
 *  경합이 생기고, 센터당 active 1개 유니크 인덱스도 흔들린다)
 */
export async function currentSubscription(centerId: number): Promise<SaasSubscription | null> {
  const { data } = await supabase
    .from("saas_subscriptions")
    .select("id, center_id, firebase_uid, plan_code, status, started_on, expires_on, billing_key")
    .eq("center_id", centerId)
    .eq("status", "active")
    .maybeSingle();
  return (data as SaasSubscription | null) ?? null;
}

/**
 * 이 사용자가 이 센터의 CRM 에 들어갈 수 있는가.
 *
 * 🚨 강제 대상이 아니면 **DB 를 보지 않고 즉시 허용**한다. 이 순서가 중요하다 —
 *    모든 `/api/crm/*` 요청이 이 함수를 지나므로, 전원 무료 상태에서 쿼리가
 *    한 건이라도 늘면 CRM 전체가 그만큼 느려진다.
 */
export async function crmAccessState(opts: {
  uid: string;
  centerId: number;
  /** 허용목록을 이메일로도 지정할 수 있다 — uid 를 찾는 것보다 설정 사고가 적다 */
  email?: string | null;
}): Promise<CrmAccessState> {
  if (!subscriptionEnforcedForUid(opts.uid, opts.email)) {
    return { allowed: true, reason: "not_enforced", expiresOn: null };
  }
  const sub = await currentSubscription(opts.centerId);
  return accessStateFor(opts.uid, sub, opts.email);
}
