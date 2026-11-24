import { NextResponse } from "next/server";
import { resolveKioskCenter } from "@/app/lib/kiosk-auth";
import {
  BLE_BEACON_UUID,
  BLE_CODES_PER_FETCH,
  BLE_MEASURED_POWER,
  BLE_TX_POWER,
  BLE_WINDOW_MS,
  bleCodes,
} from "@/app/lib/ble-beacon";

export const dynamic = "force-dynamic";

/**
 * GET /api/touch/[token]/beacon
 * 터치출석 태블릿(APK)이 블루투스로 내보낼 신호 값 — 1시간치(5분 × 12개)를 한 번에 준다.
 * 🚨 태블릿은 1시간에 한 번만 부른다(2026-11-21 Supabase 전송량 초과 사고 — 짧은 주기 폴링 금지).
 * 정적 kiosk_token(공개 /touch URL)만 받는다. 주간 QR 토큰(q1.)은 resolveKioskCenter 가 거절.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const center = await resolveKioskCenter(token);
  if (!center) {
    return NextResponse.json({ error: "유효하지 않은 링크예요" }, { status: 404 });
  }
  // 태블릿이 알려 준 송출 상태 — 현장 점검용 기록(태블릿을 직접 볼 수 없을 때 서버 로그로 확인)
  const url = new URL(request.url);
  const st = url.searchParams.get("st");
  if (st) {
    console.log(
      "[ble-beacon]",
      JSON.stringify({
        center: center.centerId,
        st: st.slice(0, 300),
        ua: (request.headers.get("user-agent") || "").slice(0, 200),
      })
    );
  }
  if (url.searchParams.get("report") === "1") {
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }

  // iBeacon major 는 16bit
  if (center.centerId > 0xffff) {
    return NextResponse.json({ error: "지원하지 않는 센터예요" }, { status: 400 });
  }

  // 정적 토큰 = 그 센터의 kiosk_token(위에서 이 값으로 조회됨) → 회전 코드의 비밀키
  const codes = bleCodes(center.centerId, token.trim(), BLE_CODES_PER_FETCH);
  return NextResponse.json(
    {
      uuid: BLE_BEACON_UUID,
      major: center.centerId,
      tx_power: BLE_TX_POWER,
      measured_power: BLE_MEASURED_POWER,
      window_ms: BLE_WINDOW_MS,
      codes,
      // 마지막 코드가 끝나기 10분 전에 다시 받는다
      refresh_at: new Date(new Date(codes[codes.length - 1].to).getTime() - 10 * 60 * 1000).toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
