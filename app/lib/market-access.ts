/**
 * 상권분석 기능 접근 제어.
 * 현재는 스페셜바디 범어점만 사용 가능하고, 다른 센터에는 사이드바에 잠금 표시가 붙는다.
 * 사이드바(클라이언트)와 API(서버)가 같은 규칙을 쓰도록 여기 한 곳에 둔다.
 */
export function isMarketAnalysisCenter(centerName: string | null | undefined): boolean {
  const n = (centerName || "").trim().toLowerCase().replace(/\s+/g, "");
  return n.includes("스페셜바디") || n.includes("specialbody");
}

/** 잠금 상태일 때 보여줄 안내 문구 */
export const MARKET_LOCKED_MESSAGE =
  "상권분석은 현재 스페셜바디 범어점에서만 사용할 수 있어요.";
