import crypto from "node:crypto";

/**
 * 블루투스 자동 출석 — 태블릿(터치출석 APK)이 내보내는 신호의 값.
 *
 * - UUID: 서비스 공통 고정값. 🚨 바꾸면 이미 설치된 회원앱이 신호를 못 찾는다
 *   (iOS 백그라운드 감지는 UUID 단위로 등록되기 때문).
 * - major: 센터 ID.
 * - minor: 5분마다 바뀌는 코드 = HMAC-SHA256(센터 kiosk_token, "ble.{센터ID}.{창}") 앞 16bit.
 *   kiosk_token 을 그대로 내보내면 신호를 엿들은 사람이 집에서도 출석할 수 있어서 회전 코드를 쓴다.
 *   비밀키는 주간 QR 과 같은 kiosk_token 이라, 설정에서 터치출석 링크를 재발급하면 신호도 바뀐다.
 */
export const BLE_BEACON_UUID = "4533142B-6EC7-4F4F-B906-92A0D6294725";

export const BLE_WINDOW_MS = 5 * 60 * 1000;

/**
 * 태블릿 광고 세기 — 최대 출력. 주머니·가방 속 폰까지 닿아야 하므로 세게 보내고,
 * 출석 범위는 출력이 아니라 폰의 거리 판정(아래 기준 세기)으로 좁힌다.
 * (2026-11-24 현장: 처음에 신호가 0건이었던 원인은 출력이 아니라 태블릿 블루투스가 꺼져 있던 것.
 *  최대 출력 + 감지 거리 '멀게'에서 2m 거리 자동 출석 확인. 약한 출력은 실측한 적 없음.)
 * measuredPower = 1m 거리에서 폰이 실제로 받는 신호 세기(dBm). 폰이 '가까움'을 판정하는 기준이라,
 * 현장에서 너무 멀리서/가까이서만 잡히면 이 값만 고쳐 배포하면 된다(APK 재설치 불필요).
 * 출력을 바꾸면 이 값도 실측해서 같이 바꿔야 한다(출력 한 단계 ≈ 6~8dB).
 */
export const BLE_TX_POWER = "high" as const;
// 2026-11-25 입구 태블릿(Infos_Duple) 실측: 2m 거리에서 폰(S20 Ultra) 수신 세기 -58~-72(중간 -63).
// 사장님 기준 "2m 는 '보통'에서 출석" → 보통 문턱 약 -68(= -57 × 1.195). 가깝게(+8) ≈ -59(1m 안쪽), 멀게(-4) ≈ -73.
export const BLE_MEASURED_POWER = -57;

/** 태블릿에 한 번에 내려주는 코드 개수 — 12 × 5분 = 1시간치(하루 24회 호출) */
export const BLE_CODES_PER_FETCH = 12;

export function bleWindow(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / BLE_WINDOW_MS);
}

export function bleMinor(centerId: number, kioskSecret: string, window: number): number {
  return crypto
    .createHmac("sha256", kioskSecret)
    .update(`ble.${centerId}.${window}`)
    .digest()
    .readUInt16BE(0);
}

/** 지금 창부터 count 개 — 태블릿이 시간에 맞춰 차례로 광고한다 */
export function bleCodes(
  centerId: number,
  kioskSecret: string,
  count: number = BLE_CODES_PER_FETCH,
  nowMs: number = Date.now()
): { minor: number; from: string; to: string }[] {
  const w0 = bleWindow(nowMs);
  return Array.from({ length: count }, (_, i) => {
    const w = w0 + i;
    return {
      minor: bleMinor(centerId, kioskSecret, w),
      from: new Date(w * BLE_WINDOW_MS).toISOString(),
      to: new Date((w + 1) * BLE_WINDOW_MS).toISOString(),
    };
  });
}

/** 지금 창 ±1 만 허용(창 경계·태블릿 시계 오차 유예). 비교는 상수 시간. */
export function verifyBleMinor(
  centerId: number,
  kioskSecret: string,
  minor: number,
  nowMs: number = Date.now()
): boolean {
  if (!Number.isInteger(minor) || minor < 0 || minor > 0xffff) return false;
  const w = bleWindow(nowMs);
  const got = Buffer.alloc(2);
  got.writeUInt16BE(minor);
  let ok = false;
  for (const win of [w - 1, w, w + 1]) {
    const want = Buffer.alloc(2);
    want.writeUInt16BE(bleMinor(centerId, kioskSecret, win));
    // 세 창을 모두 비교한다(일찍 빠져나가지 않음)
    if (crypto.timingSafeEqual(got, want)) ok = true;
  }
  return ok;
}

/** 기기 전용 출석 토큰 — 원문은 기기에만, 서버에는 해시만 저장 */
export function makeBleDeviceToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashBleDeviceToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
