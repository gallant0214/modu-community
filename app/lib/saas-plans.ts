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
  /** 요금제 페이지에 나열할 포함 기능 */
  features: string[];
}

export const CRM_CENTER_1M = "crm_center_1m";

export const SAAS_PLANS: SaasPlan[] = [
  {
    code: CRM_CENTER_1M,
    name: "센터 CRM 1개월 이용권",
    priceWon: 99000,
    periodMonths: 1,
    summary: "회원 관리부터 매출 정산까지, 센터 운영에 필요한 기능을 한 달 동안 모두 쓰실 수 있어요.",
    features: [
      "회원·이용권 관리 (회원권·수강권·대여권·락커)",
      "예약·출석 관리 + 태블릿 터치 출석",
      "매출·정산·경영 요약 통계",
      "직원 급여·커미션 계산",
      "전자계약서 작성·발송",
      "회원용 앱 · 강사용 앱 연동",
      "문자·앱 푸시 자동 알림",
    ],
  },
];

export function findPlan(code: string | null | undefined): SaasPlan | null {
  return SAAS_PLANS.find((p) => p.code === code) ?? null;
}

/** 지금 판매 중인 기본 요금제 — 하나뿐이라 화면에서 고를 필요가 없다 */
export function defaultPlan(): SaasPlan {
  return SAAS_PLANS[0];
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
