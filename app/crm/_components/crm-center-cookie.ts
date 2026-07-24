"use client";

/**
 * 진입 선택기에서 고른 센터를 저장하는 쿠키(`crm_center_id`) 헬퍼.
 * - path=/ : /crm 페이지와 /api/crm/* 요청 모두에 자동 전송 → 서버(requireCrmContext)가 읽음.
 * - 세션 쿠키(Max-Age 없음): 브라우저 종료 시 사라져 새 세션마다 재선택("항상 선택").
 * - 값은 "선호"일 뿐. 서버가 실제 멤버십을 검증하므로 위조해도 권한 상승 불가.
 */
const COOKIE_NAME = "crm_center_id";

export function getCenterCookie(): number | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)crm_center_id=(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function setCenterCookie(centerId: number): void {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_NAME}=${centerId};path=/;SameSite=Lax`;
}

export function clearCenterCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_NAME}=;path=/;Max-Age=0;SameSite=Lax`;
}
