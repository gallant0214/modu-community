/**
 * 신규/재등록 판정 공용 규칙 (화면·서버 공용 순수 함수).
 *
 * 사용자 결정(2026-11-14):
 *   1) 이름에 '재등록'이 붙은 **유료** 상품(회원권)을 산 회원은 재등록이다.
 *      — 이관 때 첫 '2개월 (신규)' 기록이 빠졌거나 온라인으로 재등록가를 산 회원이 '신규'로 남지 않게.
 *   2) 무료 서비스(신규 리뷰작성·리뷰 연장·연장쿠폰·체험권·서비스 회원권·서비스 PT·O.T 등)는
 *      **등록 횟수에 넣지 않는다**. 신규 회원이 리뷰 보상으로 1주를 받아도 신규를 유지한다.
 */

/** 0원일 때 무료 서비스로 보는 이름 — '쿠폰제'(유료 횟수권)는 제외 */
const FREE_SERVICE_RE = /리뷰|체험|서비스|연장|쿠폰(?!제)|양도|지인소개|설문|O\.?T/;
const FREE_PASS_RE = /서비스|체험|O\.?T/;
const RENEWAL_PLAN_RE = /재등록/;

/**
 * 무료 서비스 회원권인가.
 * @param freeProductNames 센터 상품 중 0원 회원권 이름 — 키워드가 없는 0원 상품(예: '지인소개 이벤트')도 잡는다
 */
export function isFreeServiceMembership(
  planName: string | null | undefined,
  priceWon: number | null | undefined,
  freeProductNames?: ReadonlySet<string>
): boolean {
  if ((priceWon ?? 0) > 0) return false;
  const name = (planName ?? "").trim();
  return !!freeProductNames?.has(name) || FREE_SERVICE_RE.test(name);
}

/** 무료 서비스 수강권인가 — 서비스 세션 분리 발급(issue_type='service') 또는 0원 서비스·체험·OT */
export function isFreeServicePass(
  issueType: string | null | undefined,
  lessonKind: string | null | undefined,
  priceWon: number | null | undefined
): boolean {
  if (issueType === "service") return true;
  return (priceWon ?? 0) <= 0 && FREE_PASS_RE.test(lessonKind ?? "");
}

/** 이름에 '재등록'이 붙은 상품인가 (무료 여부는 따로 본다 — '재등록 리뷰작성 10일'은 무료) */
export function isRenewalPlanName(planName: string | null | undefined): boolean {
  return RENEWAL_PLAN_RE.test(planName ?? "");
}

/** 유료 '재등록' 회원권 구매 = 재등록 (환불 건은 제외) */
export function isPaidRenewalMembership(
  row: { plan_name: string | null; price_won: number | null; status?: string | null },
  freeProductNames?: ReadonlySet<string>
): boolean {
  if (row.status === "refunded" || row.status === "deleted") return false;
  return isRenewalPlanName(row.plan_name) && !isFreeServiceMembership(row.plan_name, row.price_won, freeProductNames);
}
