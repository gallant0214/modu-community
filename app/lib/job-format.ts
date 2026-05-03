// 구인글 salary / deadline 표시 포맷터 공통 로직
// 웹 + (필요 시) 앱에서 동일 규칙 사용

/**
 * 급여 표시 정리
 * - "연봉 3000만원 ~ 5000만원" → "연봉 3,000~5,000만원"
 * - "시급 12000원 ~ 15000원" → "시급 12,000~15,000원"
 * - "주급 50만원 ~ 80만원" → "주급 50~80만원"
 * - 같은 단위(만원-만원, 원-원)일 때만 단위 한 번으로 묶음
 * - 4자리 이상 숫자에 천 단위 콤마
 * - "연봉/월급/주급/시급" prefix 는 유지 (구분 정보 보존)
 */
export function formatSalaryDisplay(salary?: string | null): string {
  if (!salary) return "";
  // 1) 단위 중복 제거 (backreference \2 로 같은 단위 강제)
  let s = salary.replace(/(\d[\d,]*)\s*(만원|원)\s*~\s*(\d[\d,]*)\s*\2/g, "$1~$3$2");
  // 2) 4자리 이상 연속 숫자에 콤마 (12000 → 12,000)
  s = s.replace(/\d{4,}/g, (m) => Number(m.replace(/,/g, "")).toLocaleString());
  return s;
}

/**
 * "채용시까지 (2026-05-04)" → "2026-05-04"
 * - "채용시까지" 라벨 제거 (상세 화면에 별도 표기되어 있어서 중복)
 * - 괄호 제거
 * - "상시모집" / "정원마감시" / 빈 문자열은 그대로
 */
export function formatDeadlineDisplay(deadline?: string | null): string {
  if (!deadline) return "";
  let s = deadline.trim();
  // "채용시까지 (날짜)" → "날짜"
  const match = s.match(/^채용시까지\s*\(?(\d{4}-\d{1,2}-\d{1,2})\)?\s*$/);
  if (match) return match[1];
  // "채용시까지" 단독 — 표시 안 함 (상시모집으로 자연 분류되도록)
  if (s === "채용시까지") return "";
  // 그 외엔 그대로
  return s;
}
