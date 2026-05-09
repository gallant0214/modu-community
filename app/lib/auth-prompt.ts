"use client";

/**
 * 비로그인 사용자에게 "로그인 필요" 안내 + [취소/확인] 버튼 (브라우저 confirm).
 * - action: 동작 이름 (예: "신고", "북마크"). 없으면 일반 안내문 사용.
 * - 확인 → /my (로그인 페이지)로 이동.
 *
 * 모바일(moducm-ios) 의 promptLogin 과 동일 톤으로 통일.
 * 브라우저 confirm 은 버튼 라벨이 OS/locale 종속이므로 모바일과 정확히 일치하지 않을 수 있음
 * (Chrome ko: "취소"/"확인", Safari ko: "취소"/"확인" 등).
 */
export function promptLogin(action?: string): void {
  if (typeof window === "undefined") return;
  const message = action
    ? `${action}은(는) 로그인 후 이용할 수 있습니다.\n\n로그인 하시겠습니까?`
    : "로그인 후 이용할 수 있습니다.\n\n로그인 하시겠습니까?";
  if (window.confirm(message)) {
    window.location.href = "/my";
  }
}
