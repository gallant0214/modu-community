"use client";

/**
 * 진입 선택기에서 고른 센터.
 * - 서버(requireCrmContext)용: 쿠키 `crm_center_id` (path=/ → 모든 /api/crm/* 요청에 자동 전송).
 * - 클라이언트 게이트(layout)용: sessionStorage 를 우선 사용.
 *   이유: setCookie 직후 router 이동 시 document.cookie 가 즉시 안 읽히는 레이스가 있어
 *   레이아웃이 "미선택"으로 오판 → 선택기로 되돌아가는 무한 루프가 날 수 있음.
 *   sessionStorage 는 동일 탭에서 즉시/확실히 읽혀 루프를 막는다.
 * - 세션 한정(sessionStorage + 세션 쿠키): 브라우저/탭 종료 시 초기화 → 새 세션마다 재선택("항상 선택").
 */
const COOKIE_NAME = "crm_center_id";
const SS_KEY = "crm_center_id";

export function getCenterCookie(): number | null {
  if (typeof window === "undefined") return null;
  // 1) sessionStorage 우선 (레이스 없음)
  try {
    const ss = window.sessionStorage.getItem(SS_KEY);
    if (ss && /^\d+$/.test(ss)) return Number(ss);
  } catch {
    /* ignore */
  }
  // 2) 쿠키 폴백
  if (typeof document !== "undefined") {
    const m = document.cookie.match(/(?:^|;\s*)crm_center_id=(\d+)/);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

export function setCenterCookie(centerId: number): void {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_NAME}=${centerId};path=/;SameSite=Lax`;
  try {
    window.sessionStorage.setItem(SS_KEY, String(centerId));
  } catch {
    /* ignore */
  }
}

export function clearCenterCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_NAME}=;path=/;Max-Age=0;SameSite=Lax`;
  try {
    window.sessionStorage.removeItem(SS_KEY);
  } catch {
    /* ignore */
  }
}
