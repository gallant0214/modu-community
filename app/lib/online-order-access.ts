/**
 * 온라인 주문(쇼핑 링크 판매) 기능 접근 제어.
 * 현재는 **스페셜바디 범어점 전용**(파일럿). 다른 센터에는 사이드바에서 아예 숨기고
 * 페이지·API 도 막는다. 사이드바(클라이언트)와 서버가 같은 규칙을 쓰도록 여기 한 곳에 둔다.
 */
export function isOnlineOrderCenter(centerName: string | null | undefined): boolean {
  const n = (centerName || "").trim().toLowerCase().replace(/\s+/g, "");
  // '스페셜바디 범어점' 한 곳만. 다른 스페셜바디 지점이 생기면 여기서 명시적으로 열어준다.
  return (n.includes("스페셜바디") || n.includes("specialbody")) && n.includes("범어");
}

export const ONLINE_ORDER_LOCKED_MESSAGE =
  "온라인 주문은 현재 스페셜바디 범어점에서만 사용할 수 있어요.";
