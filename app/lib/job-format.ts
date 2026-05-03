// 구인글 salary / deadline 표시 포맷터 공통 로직
// 웹 + (필요 시) 앱에서 동일 규칙 사용

/**
 * "연봉 3000만원 ~ 5000만원" → "연봉 3,000~5,000만원"
 * - 3자리 콤마 자동 삽입
 * - "X만원 ~ Y만원" 처럼 만원 두 번 나오면 한 번으로 줄임
 * - "연봉 / 월급" 같은 prefix 는 유지 (월급/연봉 구분 정보 보존)
 */
export function formatSalaryDisplay(salary?: string | null): string {
  if (!salary) return "";
  // 1) 만원 중복 제거: "X만원 ~ Y만원" → "X~Y만원"
  let s = salary.replace(/(\d[\d,]*)\s*만원\s*~\s*(\d[\d,]*)\s*만원/g, "$1~$2만원");
  // 2) 4자리 이상 연속 숫자에 콤마 (3000 → 3,000)
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
