import { TouchAttendanceKiosk } from "@/app/crm/touch-attendance/page";

export const dynamic = "force-dynamic";

/**
 * 공개 터치출석 링크 — 로그인 없이 센터 전용 토큰으로 접근.
 * /touch/[token]  (토큰은 센터 설정에서 발급)
 */
export default async function PublicTouchPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <TouchAttendanceKiosk kioskToken={token} />;
}
