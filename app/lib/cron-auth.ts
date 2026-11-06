import { timingSafeEqual } from "node:crypto";

/**
 * Vercel 크론 요청 인증 — 모든 /api/cron/* 가 이것만 쓴다.
 *
 * Vercel 은 프로젝트에 CRON_SECRET 환경변수가 있으면 크론 호출에
 * `Authorization: Bearer <CRON_SECRET>` 를 자동으로 붙인다.
 *
 * 🚨 `x-vercel-cron` 헤더로 통과시키면 안 된다 — 아무 외부 클라이언트나 이 헤더를 붙여 보낼 수 있다.
 *   (예전엔 수업 전 알림·출석 리마인더·푸시 점검·오래된 메세지 정리 크론이 이 헤더만으로 열렸다)
 * 🚨 CRON_SECRET 이 없으면 **거부**한다(fail-closed). 예전엔 비어 있으면 그냥 통과시켜서,
 *   로컬(.env.local 에 CRON_SECRET 없음)에서 크론을 부르면 인증 없이 운영 DB 로 실제 발송됐다.
 */
export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = request.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  const a = Buffer.from(got);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}
