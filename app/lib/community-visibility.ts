/**
 * 커뮤니티 메뉴 노출 스위치 — **PG 심사 중 임시로 숨기기 위한 것**.
 *
 * 토스페이먼츠 온보딩팀 회신(2026-10-14):
 *   "당사 내부 규정상 커뮤니티 기능이 존재하는 경우 가맹점 입점이 불가합니다."
 *
 * 🚨 **콘텐츠를 지우는 게 아니다.** 글·댓글·카테고리는 그대로 두고 화면에서
 *    들어가는 길만 가린다. 심사가 끝나면 환경변수만 빼면 원래대로 돌아온다.
 *    (데이터를 지우면 되돌릴 수 없고, 그럴 이유도 없다)
 *
 * 끄는 법:  NEXT_PUBLIC_HIDE_COMMUNITY=1
 * 켜는 법:  위 환경변수를 **지운다** (0 으로 두지 말고 삭제 — 값이 남아 있으면 헷갈린다)
 *
 * 🚨 `NEXT_PUBLIC_` 이라 빌드 시점에 박힌다. 값을 바꾸면 **재배포가 필요하다.**
 */
export function communityHidden(): boolean {
  return process.env.NEXT_PUBLIC_HIDE_COMMUNITY === "1";
}

/** 커뮤니티로 들어가는 길을 보여줄지 */
export function communityVisible(): boolean {
  return !communityHidden();
}
