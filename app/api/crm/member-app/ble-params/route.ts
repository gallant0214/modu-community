import { NextResponse } from "next/server";
import { bleMeasuredPowerFor } from "@/app/lib/ble-beacon";
import { checkRateLimit, getClientIp } from "@/app/lib/security";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/member-app/ble-params?major=<센터ID>
 * 아이폰 회원앱이 '가까움'을 Android 와 같은 기준으로 판정하기 위한 값 — 그 센터 태블릿이 지금 내보내는 1m 기준 세기.
 * (Android 는 신호에서 직접 읽지만 아이폰은 OS 가 주지 않는다.) 신호에 그대로 실려 나가는 값이라 비밀이 아니다.
 * 회원앱은 입구 신호가 잡힐 때 한 번만 부른다(짧은 주기 폴링 금지).
 */
export async function GET(request: Request) {
  const limited = await checkRateLimit(getClientIp(request), "read");
  if (limited) return limited;
  const major = Number(new URL(request.url).searchParams.get("major"));
  if (!Number.isInteger(major) || major <= 0 || major > 0xffff) {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  return NextResponse.json(
    { ok: true, measured_power: await bleMeasuredPowerFor(major), near_meters: 2.0 },
    { headers: { "Cache-Control": "no-store" } }
  );
}
