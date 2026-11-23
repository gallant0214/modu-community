import { errLogOnly } from "@/app/lib/api-error";
import { NextResponse } from "next/server";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";
import { resolveKioskCenter } from "@/app/lib/kiosk-auth";
import { memberSelfCheckIn } from "@/app/lib/member-self-checkin";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/member-app/check-in  { kiosk_token }
 * 회원 앱이 키오스크(터치출석) 화면의 QR(kiosk_token)을 스캔해 '본인'을 출석 처리.
 * - kiosk_token → 센터 해석(resolveKioskCenter)
 * - 회원 인증(requireMemberForCenter): 그 센터 소속 회원만 통과 → 남의 센터 출석 불가
 * - source='app'
 */
export async function POST(request: Request) {
  let body: { kiosk_token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const token = (body.kiosk_token ?? "").trim();
  if (!token) return NextResponse.json({ error: "QR 정보가 없어요" }, { status: 400 });

  // 회원앱 QR 출석 — 센터 화면의 주간 QR 을 받는 유일한 곳(아래에서 회원 본인 인증을 한다)
  const center = await resolveKioskCenter(token, { allowWeeklyQr: true });
  if (!center) {
    return NextResponse.json({ error: "유효하지 않은 QR이에요. 센터 화면의 QR을 다시 스캔해 주세요." }, { status: 404 });
  }

  // 이 센터 소속 회원인지 인증
  const ctx = await requireMemberForCenter(request, center.centerId);
  if (isMemberError(ctx)) return ctx;

  const result = await memberSelfCheckIn(center.centerId, ctx.memberId, "app");
  if ("error" in result) {
    const detail = "detail" in result ? result.detail : undefined;
    return NextResponse.json({ error: result.error, detail: errLogOnly(detail) }, { status: result.status });
  }
  return NextResponse.json({ ...result, center_name: center.centerName });
}
