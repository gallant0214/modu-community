import { NextResponse } from "next/server";
import { resolveKioskCenter, makeWeeklyQrToken, nextBucketBoundaryMs } from "@/app/lib/kiosk-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/touch/[token]/qr
 * 공개 터치출석(/touch/[token]) 키오스크가 표시할 '주간 회전 QR 토큰' 반환.
 * URL 토큰(정적 kiosk_token)로 센터 확인 후, 그 토큰을 시크릿으로 주간 회전 QR 생성.
 * (정적 토큰을 이미 가진 화면이므로 별도 인증 불필요.)
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const center = await resolveKioskCenter(token);
  if (!center) {
    return NextResponse.json({ qr: null, next_rotate_at: null }, { status: 404 });
  }
  // 공개 URL 토큰은 정적 kiosk_token 자체 → 그대로 시크릿으로 사용.
  const qr = makeWeeklyQrToken(center.centerId, token.trim());
  return NextResponse.json({
    qr,
    next_rotate_at: new Date(nextBucketBoundaryMs()).toISOString(),
  });
}
