/**
 * 결제·온보딩이 끝난 뒤 돌아갈 주소 — **우리 사이트 내부 경로만** 통과시킨다.
 *
 * 🚨 `/` 로 시작하는지만 보면 뚫린다. 전부 외부 사이트로 나가는 값이다:
 *      //evil.com      프로토콜 상대 주소
 *      /\evil.com      브라우저가 `//` 로 정규화한다
 *      /<TAB>/evil.com 탭·개행은 URL 파싱 때 제거돼 다시 `//` 가 된다
 *
 * KG이니시스 가맹점 보안 권고(2026-11) [2] '리다이렉트 기능을 이용한 피싱 공격 방지' 와
 * 같은 취지다. 결제 직후의 복귀 주소는 공격자가 제일 노리기 좋은 자리다 —
 * 회원이 방금 카드번호를 넣고 "결제 완료" 를 본 직후라 가짜 안내 화면을 그대로 믿는다.
 */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // 브라우저가 어차피 떼어내는 문자들 — 떼고 나서 판정해야 우회가 막힌다
  const v = raw.replace(/[\u0000-\u001f\u007f]/g, "");
  if (!v.startsWith("/")) return null;
  if (v.startsWith("//") || v.startsWith("/\\")) return null;
  return v;
}
