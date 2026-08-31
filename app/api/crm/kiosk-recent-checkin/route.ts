import { NextResponse } from "next/server";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { getLatestQrCheckin } from "@/app/lib/crm-checkin";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/kiosk-recent-checkin?since=<attendanceId>
 * 로그인 상태 터치출석 화면이 폴링 — 회원앱 QR 출석(source='app')을 감지해
 * 번호출석과 동일한 결과창을 태블릿에 띄우기 위한 데이터 반환.
 * since 없으면 baseline(latestId 만).
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const sinceRaw = url.searchParams.get("since");
  const since = sinceRaw != null && sinceRaw !== "" ? Number(sinceRaw) : null;

  const result = await getLatestQrCheckin(
    ctx.centerId,
    since != null && Number.isFinite(since) ? since : null
  );
  return NextResponse.json(result);
}
