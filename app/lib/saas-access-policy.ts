/**
 * CRM 이용권(구독) **정책 판정** — DB 를 보지 않는 순수 로직.
 *
 * `saas-subscription.ts` 가 이걸 쓰고 다시 내보낸다. 왜 쪼갰나:
 *   저쪽은 `server-only` + supabase 를 import 해서 테스트에서 불러올 수 없다.
 *   그렇다고 테스트에 규칙을 **복사해 두면** 한쪽만 고쳐져 어긋난다
 *   (과거에 같은 규칙을 두 군데 둬서 버그가 세 번 났다).
 *   그래서 돈·접근이 걸린 판정만 여기로 내려 실제 코드를 그대로 검증한다.
 */
import { kstTodayYmd } from "@/app/lib/crm-coupons";

/* ════════════════════════════════════════════════════════════════
   누구에게 구독을 강제할지
   ════════════════════════════════════════════════════════════════ */

/** 쉼표 구분 목록 → 공백·빈값 제거. 이메일은 대소문자를 무시한다 */
function parseIdList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

/** 목록에 이 사용자가 있는가 — firebase uid 또는 이메일로 지정할 수 있다 */
function matchesId(list: string[], uid: string, email?: string | null): boolean {
  const mail = (email ?? "").trim().toLowerCase();
  return list.some((v) => v === uid || (!!mail && v.toLowerCase() === mail));
}

/**
 * 🚨🚨 **극성 주의 — 판매 허용목록과 반대다.**
 *
 *   `ONLINE_SALES_MEMBER_ALLOWLIST` (센터 이용권 판매)
 *     → 값이 있으면 **그 회원만 결제 가능**, 파싱 실패 시 **전원 차단**(fail-closed).
 *        돈을 받는 쪽이라 설정 실수가 "전원 허용" 으로 풀리면 그게 사고다.
 *
 *   `CRM_SUBSCRIPTION_ENFORCE_UIDS` (여기)
 *     → 값이 **비어 있으면 아무에게도 강제하지 않는다(= 전원 무료)**.
 *        설정 실수로 전원을 잠그면 사장님들이 자기 CRM 에서 쫓겨나고 현장 운영이
 *        그 자리에서 멈춘다. 그쪽이 훨씬 큰 사고라 일부러 뒤집었다.
 *
 * PG 승인 전까지는 **심사용 테스트 계정 하나만** 넣는다.
 * 값은 firebase uid 또는 **이메일** 둘 다 된다 (예: `review@example.com`).
 */
export function subscriptionEnforcedUids(): string[] {
  return parseIdList(process.env.CRM_SUBSCRIPTION_ENFORCE_UIDS);
}

/**
 * 이 사용자에게 구독 결제를 강제하는가.
 * 환경변수만 본다 — 전원 무료 상태에서 `/api/crm/*` 요청마다 쿼리가 늘지 않게 하려는 것이다.
 *
 * uid 와 **이메일 둘 다** 받는다 — 운영자가 firebase uid 를 찾으려면 콘솔을 뒤져야 해서
 * 실수하기 쉽다. 이메일은 바로 아는 값이라 설정 사고가 줄어든다.
 */
export function subscriptionEnforcedForUid(uid: string, email?: string | null): boolean {
  const list = subscriptionEnforcedUids();
  return list.length > 0 && matchesId(list, uid, email);
}

/* ════════════════════════════════════════════════════════════════
   구독 유효성
   ════════════════════════════════════════════════════════════════ */

export interface SubscriptionLike {
  status: string;
  /** 만료일 (KST, YYYY-MM-DD). **그날까지 포함**해서 유효하다 */
  expires_on: string;
}

/** 오늘(KST) 기준으로 아직 유효한 구독인지 — 만료일 **당일까지 포함** */
export function isSubscriptionLive(sub: SubscriptionLike | null | undefined): boolean {
  if (!sub || sub.status !== "active") return false;
  return kstTodayYmd() <= sub.expires_on;
}

export type AccessReason = "ok" | "not_enforced" | "no_subscription" | "expired";

export interface CrmAccessState {
  allowed: boolean;
  reason: AccessReason;
  expiresOn: string | null;
}

/**
 * 구독 행을 이미 들고 있을 때의 접근 판정.
 * (DB 조회는 `saas-subscription.ts` 의 `crmAccessState()` 가 한다)
 */
export function accessStateFor(
  uid: string,
  sub: SubscriptionLike | null | undefined,
  email?: string | null
): CrmAccessState {
  if (!subscriptionEnforcedForUid(uid, email)) {
    return { allowed: true, reason: "not_enforced", expiresOn: null };
  }
  if (!sub) return { allowed: false, reason: "no_subscription", expiresOn: null };
  if (!isSubscriptionLive(sub)) {
    return { allowed: false, reason: "expired", expiresOn: sub.expires_on };
  }
  return { allowed: true, reason: "ok", expiresOn: sub.expires_on };
}

/** 사장님에게 보여줄 안내 문구 */
export const SUBSCRIPTION_BLOCKED_MESSAGE: Record<string, string> = {
  no_subscription: "센터 CRM 이용권이 필요해요. 이용권을 구매하시면 바로 사용하실 수 있습니다.",
  expired: "센터 CRM 이용권이 만료됐어요. 다시 결제하시면 그대로 이어서 사용하실 수 있습니다.",
};

/* ════════════════════════════════════════════════════════════════
   판매 스위치 (센터 이용권 쪽과 완전히 분리)
   ════════════════════════════════════════════════════════════════ */

/**
 * CRM 이용권 판매 스위치.
 *
 * 🚨 `onlineSalesEnabled()`(센터가 회원에게 이용권을 파는 스위치)와 **절대 섞지 않는다.**
 *    한쪽을 켜려다 다른 쪽이 열리면 엉뚱한 상품이 팔린다.
 */
export function saasSalesEnabled(): boolean {
  return process.env.SAAS_SALES_ENABLED === "1";
}

/**
 * 테스트 채널로 도는 동안 결제를 허용할 사용자.
 *
 * 이쪽은 **돈을 받는 쪽**이라 `ONLINE_SALES_MEMBER_ALLOWLIST` 와 같은 fail-closed 다 —
 * 값이 있는데 쓸 수 있는 uid 가 하나도 안 나오면 전원을 막는다.
 * 제한을 풀 때는 값을 비우는 게 아니라 **환경변수를 지운다.**
 */
export function saasSalesAllowedForUid(uid: string, email?: string | null): boolean {
  if (!saasSalesEnabled()) return false;
  const raw = (process.env.SAAS_SALES_UID_ALLOWLIST ?? "").trim();
  if (!raw) return true;
  // 🚨 값이 있는데 유효 항목이 0개면 전원 차단(fail-closed)
  return matchesId(parseIdList(raw), uid, email);
}

export type SaasPgProvider = "toss" | "portone";

/**
 * CRM 이용권 결제를 어느 PG 로 받을지.
 *
 * 토스 → 거절(헬스 업종) → 포트원/KG이니시스 → 다시 토스(소프트웨어 업종으로 재심사).
 * PG 가 자주 바뀌므로 환경변수 하나로 갈아끼울 수 있게 둔다.
 *
 * 🚨 **이미 만들어진 주문은 이 값을 보지 않는다.** 주문 행에 저장된 `pg_provider` 를 따른다.
 *    결제창을 띄운 뒤 이 값을 바꾸면, 진행 중이던 결제가 엉뚱한 PG 로 승인 요청돼
 *    돈은 빠지고 발급은 안 되는 상태가 된다.
 */
export function saasPgProvider(): SaasPgProvider {
  return process.env.SAAS_PG_PROVIDER === "portone" ? "portone" : "toss";
}

export const SAAS_SALES_DISABLED_MESSAGE =
  "이용권 결제는 준비 중이에요. 문의해주시면 바로 도와드리겠습니다.";

/** pending 주문이 살아있는 시간 — 센터 이용권과 같은 30분 */
export const SAAS_ORDER_TTL_MINUTES = 30;
