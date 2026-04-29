// 시/도 → 약어 매핑
const REGION_SHORT: Record<string, string> = {
  "서울특별시": "서울",
  "부산광역시": "부산",
  "대구광역시": "대구",
  "인천광역시": "인천",
  "광주광역시": "광주",
  "대전광역시": "대전",
  "울산광역시": "울산",
  "세종특별자치시": "세종",
  "경기도": "경기",
  "강원도": "강원",
  "강원특별자치도": "강원",
  "충청북도": "충북",
  "충청남도": "충남",
  "전라북도": "전북",
  "전북특별자치도": "전북",
  "전라남도": "전남",
  "경상북도": "경북",
  "경상남도": "경남",
  "제주특별자치도": "제주",
};

/**
 * 게시글 region 값을 짧은 표시 형태로 변환.
 *
 * 입력 예시:
 *   "대구광역시 - 수성구"  → "대구 수성구"
 *   "대구광역시 수성구"    → "대구 수성구"   (dash 없는 변형도 처리)
 *   "전국"                  → null
 *   ""                      → null
 *   "대구광역시"           → "대구"          (sub 없을 때)
 */
export function formatRegionShort(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "전국") return null;

  // 1) " - " 구분자 우선 시도
  let [city, sub] = trimmed.split(/\s*-\s*/).map((s) => s.trim());

  // 2) dash 없으면, 공백 기준으로 첫 토큰이 매핑에 있는지 확인
  if (!sub) {
    const m = trimmed.match(/^(\S+)\s+(.+)$/);
    if (m && REGION_SHORT[m[1]]) {
      city = m[1];
      sub = m[2].trim();
    }
  }

  const shortCity = REGION_SHORT[city] ?? city;
  return sub ? `${shortCity} ${sub}` : shortCity;
}
