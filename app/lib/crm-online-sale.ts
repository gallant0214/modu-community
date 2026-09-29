/**
 * 온라인(홈페이지·회원앱) 판매 대상 규칙 — **화면과 서버가 함께 쓰는 단일 소스**.
 *
 * 🚨 이 목록을 서버(member-checkout)와 상품관리 화면에 따로 적어뒀다가
 *    운동복을 서버에만 추가해, 상품관리에 '온라인 판매' 스위치가 안 뜨는 일이 있었다.
 *    같은 규칙은 한 곳에만 둔다. 이 파일은 서버 전용 모듈을 import 하지 않는다
 *    (클라이언트 컴포넌트에서도 불러야 하므로).
 */

/** 온라인에서 팔 수 있는 상품 유형 */
export const ONLINE_SELLABLE_TYPES = new Set([
  "membership",
  "personal",
  "group",
  "class",
  "apparel", // 운동복 — 재고 개념이 없어 온라인 판매에 문제가 없다
]);

/**
 * 곁들임 전용 — 단독 구매를 막고 이용권에 붙여서만 판다.
 * 신규/재등록 구분도 의미가 없어 구매 자격 선택을 노출하지 않는다.
 */
export const ADDON_TYPES = new Set(["apparel"]);

/**
 * 🚨 락커는 온라인에서 팔지 않는다 (2026-09-24 사용자 확정).
 *    남은 자리가 탈의실 기준 5~7개뿐이라 돈을 받고도 줄 자리가 없는 상황이 생긴다.
 *    자리 배정은 직원이 회원과 상담해 처리한다.
 */

/** 이 유형에 '온라인 판매' 스위치를 보여줄지 */
export function canSellOnline(type: string): boolean {
  return ONLINE_SELLABLE_TYPES.has(type);
}

/** 이 유형에 신규/재등록 구매 자격을 걸 수 있는지 */
export function hasEligibility(type: string): boolean {
  return ONLINE_SELLABLE_TYPES.has(type) && !ADDON_TYPES.has(type);
}
