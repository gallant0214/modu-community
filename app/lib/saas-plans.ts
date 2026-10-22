/**
 * 모두의지도사가 파는 **센터 CRM 이용권 요금제** 단일 소스.
 *
 * 테이블이 아니라 상수 모듈인 이유: 판매자가 하나뿐이고 요금제도 하나다.
 * 가격이 바뀌어도 `saas_orders` 가 결제 시점의 이름·금액·기간을 스냅샷으로 들고 있어
 * 과거 주문의 근거는 남는다. (`crm-online-sale.ts` 와 같은 패턴 —
 * 같은 규칙을 두 군데 두면 한쪽만 고쳐져 어긋난다)
 *
 * 🚨 상품을 늘리기 전에 PG 심사를 먼저 본다. 지금 심사에 올린 건 **1개월권 하나**다.
 *    심사에 없는 상품을 사이트에 올리면 "계약에 없는 상품" 으로 지적된다.
 */
import { computeExpiryYmd } from "@/app/lib/duration-convert";

export interface SaasPlan {
  code: string;
  /** 결제 내역·영수증에 찍히는 이름 */
  name: string;
  priceWon: number;
  periodMonths: number;
  /** 요금제 페이지 한 줄 설명 */
  summary: string;
  /** 1개월권 대비 할인율(%) — 0 이면 표시하지 않는다 */
  discountPercent: number;
}

export const CRM_CENTER_1M = "crm_center_1m";
export const CRM_CENTER_2M = "crm_center_2m";
export const CRM_CENTER_3M = "crm_center_3m";
export const CRM_CENTER_6M = "crm_center_6m";

/** 요금제 공통 포함 기능 — 기간만 다르고 기능은 같다 */
export const PLAN_FEATURES: string[] = [
  "회원·이용권 관리 (회원권·수강권·대여권·락커)",
  "예약·출석 관리 + 태블릿 터치 출석",
  "매출·정산·경영 요약 통계",
  "직원 급여·커미션 계산",
  "전자계약서 작성·발송",
  "회원용 앱 · 강사용 앱 연동",
  "문자·앱 푸시 자동 알림",
];

/**
 * 🚨 가격은 **월 환산이 딱 떨어지게** 잡았다 — 할인 폭을 구매자가 바로 알아본다.
 *    1개월 99,000 / 2개월 94,000 / 3개월 89,000 / 6개월 79,000 (월 기준)
 *    긴 기간일수록 싸다는 게 숫자로 보여야 장기 결제가 늘어난다.
 */
export const SAAS_PLANS: SaasPlan[] = [
  {
    code: CRM_CENTER_1M,
    name: "센터 CRM 1개월 이용권",
    priceWon: 99000,
    periodMonths: 1,
    summary: "먼저 한 달 써보고 결정하세요.",
    discountPercent: 0,
  },
  {
    code: CRM_CENTER_2M,
    name: "센터 CRM 2개월 이용권",
    priceWon: 188000,
    periodMonths: 2,
    summary: "월 94,000원 — 1개월권보다 5% 저렴합니다.",
    discountPercent: 5,
  },
  {
    code: CRM_CENTER_3M,
    name: "센터 CRM 3개월 이용권",
    priceWon: 267000,
    periodMonths: 3,
    summary: "월 89,000원 — 한 분기를 한 번에, 10% 저렴합니다.",
    discountPercent: 10,
  },
  {
    code: CRM_CENTER_6M,
    name: "센터 CRM 6개월 이용권",
    priceWon: 474000,
    periodMonths: 6,
    summary: "월 79,000원 — 가장 저렴한 20% 할인입니다.",
    discountPercent: 20,
  },
];

/**
 * 판매를 잠시 내릴 요금제 — 코드를 쉼표로 적는다.
 *
 * 🚨 PG 심사에서 특정 기간이 지적되면 **배포 없이** 그 상품만 내릴 수 있어야 한다.
 *    (이니시스는 원래 '서비스 제공기간 3개월 이내' 조건이 있었고, 6개월은
 *     2026-10-22 에 별도로 확인받았다. 조건이 다시 바뀔 수 있다)
 *    예: NEXT_PUBLIC_SAAS_HIDDEN_PLANS=crm_center_6m
 */
function hiddenPlanCodes(): string[] {
  return (process.env.NEXT_PUBLIC_SAAS_HIDDEN_PLANS ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

/** 지금 화면에 노출하고 결제까지 허용할 요금제 */
export function visiblePlans(): SaasPlan[] {
  const hidden = hiddenPlanCodes();
  return SAAS_PLANS.filter((p) => !hidden.includes(p.code));
}

/** 월 환산 금액 — 할인 폭을 보여줄 때 쓴다 */
export function monthlyWon(plan: SaasPlan): number {
  return Math.round(plan.priceWon / plan.periodMonths);
}

/** 할인 전 정가 (1개월권 × 개월수) */
export function listPriceWon(plan: SaasPlan): number {
  return SAAS_PLANS[0].priceWon * plan.periodMonths;
}

export function findPlan(code: string | null | undefined): SaasPlan | null {
  return SAAS_PLANS.find((p) => p.code === code) ?? null;
}

/**
 * 요금제를 고르지 않았을 때의 기본값.
 * 🚨 숨긴 요금제가 기본이 되면 "고를 수 없는 상품으로 결제" 가 되므로 노출 중인 것 중에서 고른다.
 */
export function defaultPlan(): SaasPlan {
  return visiblePlans()[0] ?? SAAS_PLANS[0];
}

/** 결제까지 허용되는 요금제인지 — 서버가 주문 생성 전에 확인한다 */
export function isPlanSellable(code: string | null | undefined): boolean {
  return visiblePlans().some((p) => p.code === code);
}

/**
 * 구독 만료일(그날까지 포함) 계산.
 *
 * 🚨 **일수 환산이 아니라 달력 기준**이다 — 1개월은 30일이 아니다.
 *    기존 이용권과 같은 규칙을 쓰려고 `computeExpiryYmd()` 를 그대로 재사용한다
 *    (시작일 + N개월 - 1일, 월말은 클램프). 여기서 따로 계산하면 센터 이용권과
 *    만료일 규칙이 갈라진다.
 *
 * @param startYmd 이용 시작일 (KST, YYYY-MM-DD)
 */
export function planExpiryOn(startYmd: string, periodMonths: number): string {
  return computeExpiryYmd(startYmd, periodMonths, "month");
}

export interface NextPeriod {
  /** 이번에 결제한 기간의 시작일 */
  startOn: string;
  /** 새 만료일 (그날까지 포함) */
  expiresOn: string;
  /** 남아 있던 기간에 이어붙였는지 */
  chained: boolean;
}

/**
 * 재결제 시 새 만료일.
 *
 * 🚨 **돈이 걸린 규칙이라 단일 소스로 둔다.** `completeSaasOrder()` 와 테스트가
 *    같은 함수를 쓴다 — 규칙을 복사하면 한쪽만 고쳐져 기간이 어긋난다.
 *
 * 이어붙이기(`moducm-crm-chain-start-date` 와 같은 규칙):
 *   · 아직 유효한 구독이 있으면 → **기존 만료일 다음 날**부터 N개월 더
 *     (만료 전에 미리 결제한 사장님이 남은 기간을 잃지 않는다)
 *   · 만료됐거나 구독이 없으면 → **오늘**부터 N개월
 */
export function nextExpiryOn(opts: {
  currentExpiresOn: string | null | undefined;
  periodMonths: number;
  todayYmd: string;
}): NextPeriod {
  const { currentExpiresOn, periodMonths, todayYmd } = opts;
  const live = !!currentExpiresOn && todayYmd <= currentExpiresOn;
  if (!live) {
    return { startOn: todayYmd, expiresOn: planExpiryOn(todayYmd, periodMonths), chained: false };
  }
  // 기존 만료 다음 날부터 — computeExpiryYmd(ymd, 1, "day") 가 '하루 뒤' 를 준다
  const startOn = computeExpiryYmd(currentExpiresOn!, 1, "day");
  return { startOn, expiresOn: planExpiryOn(startOn, periodMonths), chained: true };
}

export const won = (n: number) => `${Math.round(n).toLocaleString()}원`;
