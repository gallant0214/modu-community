import crypto from "node:crypto";
import { supabase } from "./supabase";

const KST_MS = 9 * 3600 * 1000;
const WEEK_MS = 7 * 86400000;

/** 7일(1주) 버킷 번호 — KST 기준. 매주 자동으로 증가(=QR 자동 변경). */
export function weeklyBucket(nowMs: number = Date.now()): number {
  return Math.floor((nowMs + KST_MS) / WEEK_MS);
}

/** 다음 주 버킷이 시작되는 시각(UTC ms) — 이 시점에 QR 이 바뀐다. */
export function nextBucketBoundaryMs(nowMs: number = Date.now()): number {
  return (weeklyBucket(nowMs) + 1) * WEEK_MS - KST_MS;
}

/**
 * 주간 회전 QR 토큰 생성. 형식 `q1.<centerId>.<bucket>.<sig>`.
 * sig = HMAC-SHA256(kiosk_token, "centerId.bucket") 앞 32자.
 * 매주 bucket 이 바뀌므로 토큰(QR)도 자동으로 바뀐다. kiosk_token 을 시크릿으로 재사용.
 */
export function makeWeeklyQrToken(
  centerId: number,
  kioskSecret: string,
  bucket: number = weeklyBucket()
): string {
  const sig = crypto
    .createHmac("sha256", kioskSecret)
    .update(`${centerId}.${bucket}`)
    .digest("hex")
    .slice(0, 32);
  return `q1.${centerId}.${bucket}.${sig}`;
}

/**
 * 공개 터치출석 토큰 → 센터 해석.
 * - `q1.` 로 시작하면 주간 회전 QR 토큰: HMAC 검증 + 현재/직전 주 버킷만 허용(주 경계 유예).
 * - 그 외는 정적 kiosk_token(공개 /touch URL·레거시) 그대로 조회.
 * 유효한 활성 센터면 { centerId, centerName } 반환, 아니면 null.
 *
 * 🚨 주간 QR 토큰은 **회원앱 QR 출석(로그인한 회원 본인 출석)에서만** 받는다(allowWeeklyQr).
 *   QR 은 센터 화면에 띄워 두는 값이라 누구나 촬영할 수 있다. 예전엔 이 토큰으로
 *   공개 키오스크 API(/api/touch/*) 전체가 열려서, 로그인 없이 전 회원 이름·전화번호 조회,
 *   얼굴 특징값 다운로드, 아무 회원 출석 처리, 얼굴 사진 덮어쓰기가 가능했다.
 *   키오스크 기기는 설정에서 발급한 정적 토큰(/touch/<token> URL)만 쓴다.
 */
export async function resolveKioskCenter(
  token: string | undefined | null,
  opts: { allowWeeklyQr?: boolean } = {}
): Promise<{ centerId: number; centerName: string } | null> {
  const t = (token || "").trim();

  // ── 주간 회전 QR 토큰 ──
  if (t.startsWith("q1.")) {
    if (!opts.allowWeeklyQr) return null;
    const parts = t.split(".");
    if (parts.length !== 4) return null;
    const centerId = Number(parts[1]);
    const bucket = Number(parts[2]);
    if (!centerId || !Number.isFinite(bucket)) return null;
    const cur = weeklyBucket();
    // 현재 주 또는 직전 주(주 경계에 스캔된 QR 유예)만 허용
    if (bucket !== cur && bucket !== cur - 1) return null;
    const { data } = await supabase
      .from("crm_centers")
      .select("id, name, status, kiosk_token")
      .eq("id", centerId)
      .maybeSingle();
    const row = data as { id: number; name: string; status: string; kiosk_token: string | null } | null;
    if (!row || row.status !== "active" || !row.kiosk_token) return null;
    const expected = makeWeeklyQrToken(centerId, row.kiosk_token, bucket);
    if (t.length !== expected.length) return null;
    try {
      if (!crypto.timingSafeEqual(Buffer.from(t), Buffer.from(expected))) return null;
    } catch {
      return null;
    }
    return { centerId, centerName: row.name };
  }

  // ── 정적 kiosk_token (공개 /touch URL) ──
  // 토큰은 32자 hex(16바이트) 이상. 너무 짧으면 즉시 거절(무차별 대입 방지).
  if (t.length < 24) return null;
  const { data } = await supabase
    .from("crm_centers")
    .select("id, name, status")
    .eq("kiosk_token", t)
    .maybeSingle();
  if (!data || (data as { status: string }).status !== "active") return null;
  return { centerId: (data as { id: number }).id, centerName: (data as { name: string }).name };
}
