/**
 * 상품 duration 을 일수로 환산하는 공통 헬퍼.
 *
 * 왜 필요한가:
 *   과거엔 "12개월 = 12 × 30 = 360일" 처럼 부정확한 매핑을 여러 곳에서 반복 계산했음.
 *   그래서 12개월 회원권이 365일이 아닌 360일로 발급되는 오류가 반복 발생.
 *   앞으로는 반드시 여기 monthsToDays / unitToDays 를 통해 계산할 것.
 *
 * 정책:
 *   - 1년 = 365일 (윤년 별도 취급 안 함 — 상품 카탈로그는 고정 값)
 *   - 1개월 = 365/12 ≈ 30.42일 → 반올림.
 *     * 1개월 → 30, 3개월 → 91, 6개월 → 183, 11개월 → 335, 12개월 → 365
 *   - 1일 = 1일
 */

export function monthsToDays(months: number): number {
  const m = Math.max(0, Number(months) || 0);
  return Math.round((m * 365) / 12);
}

export function yearsToDays(years: number): number {
  const y = Math.max(0, Number(years) || 0);
  return y * 365;
}

/**
 * (value, unit) → 일수. unit 미지원/미지정이면 value 를 일수로 취급.
 */
export function unitToDays(
  value: number | null | undefined,
  unit: string | null | undefined
): number {
  const v = Math.max(0, Number(value) || 0);
  if (v === 0) return 0;
  if (unit === "year") return yearsToDays(v);
  if (unit === "month") return monthsToDays(v);
  return v; // day / null / 알 수 없음
}

/** duration_unit → 한글 라벨 (day 일 / month 개월 / year 년) */
export function unitLabel(unit: string | null | undefined): string {
  if (unit === "year") return "년";
  if (unit === "month") return "개월";
  return "일";
}

/** (value, unit) → "12개월" · "365일" · "1년" 표기 */
export function formatDuration(
  value: number | null | undefined,
  unit: string | null | undefined
): string {
  return `${Math.max(0, Number(value) || 0)}${unitLabel(unit)}`;
}
