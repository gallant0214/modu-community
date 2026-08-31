import { NextResponse } from "next/server";
import { resolveKioskCenter } from "@/app/lib/kiosk-auth";
import { getLatestQrCheckin } from "@/app/lib/crm-checkin";

export const dynamic = "force-dynamic";

/**
 * GET /api/touch/[token]/recent-checkin?since=<attendanceId>
 * 공개 터치출석(/touch/[token]) 화면이 폴링 — 회원앱 QR 출석(source='app')을 감지해
 * 번호출석과 동일한 결과창을 태블릿에 띄우기 위한 데이터 반환.
 * URL 토큰(정적 kiosk_token)으로 센터 확인. since 없으면 baseline.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const center = await resolveKioskCenter(token);
  if (!center) {
    return NextResponse.json({ latestId: 0, checkin: null }, { status: 404 });
  }

  const url = new URL(request.url);
  const sinceRaw = url.searchParams.get("since");
  const since = sinceRaw != null && sinceRaw !== "" ? Number(sinceRaw) : null;

  const result = await getLatestQrCheckin(
    center.centerId,
    since != null && Number.isFinite(since) ? since : null
  );
  return NextResponse.json(result);
}
