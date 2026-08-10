import { NextResponse } from "next/server";
import { resolveKioskCenter } from "@/app/lib/kiosk-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/touch/[token]/bootstrap
 * 공개 터치출석 키오스크 초기 정보. 토큰이 유효하면 센터명 반환.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const center = await resolveKioskCenter(token);
  if (!center) {
    return NextResponse.json({ error: "유효하지 않은 링크예요" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, centerName: center.centerName });
}
