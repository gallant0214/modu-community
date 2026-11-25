import { NextResponse, after } from "next/server";
import { errLogOnly } from "@/app/lib/api-error";
import { supabase } from "@/app/lib/supabase";
import {
  checkRateLimit,
  dailyFailureCount,
  getClientIp,
  recordDailyFailure,
} from "@/app/lib/security";
import { hashBleDeviceToken, verifyBleMinor } from "@/app/lib/ble-beacon";
import { memberSelfCheckIn } from "@/app/lib/member-self-checkin";

export const dynamic = "force-dynamic";

/** 기기당 하루 코드 실패 허용 횟수 — 넘으면 그날 블루투스 출석 중지(QR 출석은 그대로) */
const BLE_DAILY_FAIL_MAX = 5;

/**
 * 출석한 회원이 다시 입구 근처에 와도 이 시간 안에는 새로 출석하지 않는다(2026-11-23 사장님 결정, 4시간).
 * QR·번호 등 다른 방법으로 한 출석도 포함. 이때는 출석 기록·확인창·음성 모두 만들지 않는다.
 */
const BLE_REENTRY_BLOCK_MS = 4 * 60 * 60 * 1000;

/**
 * POST /api/crm/member-app/ble-check-in  { major, minor }
 * 헤더 x-ble-device-token: 기능을 켤 때 받은 기기 전용 토큰.
 *
 * 회원앱 네이티브 코드가 센터 태블릿 신호를 '가까이에서' 감지했을 때 호출(앱이 꺼져 있어도).
 * - 기기 토큰 → 회원·센터 확인 (major 가 그 회원의 센터여야 함)
 * - minor(5분 회전 코드) 검증: 지금 창 ±1
 * - 실패는 기기당 하루 5회까지 — 신호를 엿듣거나 찍어 맞히는 집 출석 방지
 * - 4시간 안에 이미 출석했으면(어떤 방법이든) 새로 출석하지 않고 duplicate
 * - 통과하면 QR 출석과 같은 처리(runCheckIn), source='ble'
 *
 * 응답 result: checked_in | duplicate — 네이티브가 결과 알림 문구를 고르는 데 쓴다.
 */
export async function POST(request: Request) {
  const limited = await checkRateLimit(getClientIp(request), "write");
  if (limited) return limited;

  const deviceToken = (request.headers.get("x-ble-device-token") ?? "").trim();
  if (deviceToken.length < 32) {
    return NextResponse.json({ error: "인증 정보가 없어요", code: "no_device" }, { status: 401 });
  }

  let body: { major?: number; minor?: number; dbg?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const major = Number(body.major);
  const minor = Number(body.minor);
  // 현장 점검용 — 폰이 보내는 감지 타이밍 요약(걸어오는 시험은 폰 기록을 직접 볼 수 없어서 서버 로그로 확인)
  if (typeof body.dbg === "string" && body.dbg) {
    console.log("[ble-check-in dbg]", body.dbg.slice(0, 400));
  }
  if (!Number.isInteger(major) || !Number.isInteger(minor)) {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const { data: device } = await supabase
    .from("crm_member_ble_devices")
    .select("id, center_id, member_id")
    .eq("token_hash", hashBleDeviceToken(deviceToken))
    .is("revoked_at", null)
    .maybeSingle();
  if (!device) {
    // 폐기됐거나 다른 기기에서 다시 켬 → 앱이 기능을 다시 켜도록 안내
    return NextResponse.json({ error: "다시 설정이 필요해요", code: "revoked" }, { status: 401 });
  }

  const failKey = String(device.id);
  if ((await dailyFailureCount("ble", failKey)) >= BLE_DAILY_FAIL_MAX) {
    return NextResponse.json({ error: "오늘은 자동 출석을 쓸 수 없어요", code: "locked" }, { status: 429 });
  }

  // 그 회원의 센터 신호인지 — 앱이 다른 센터 신호는 걸러서 보내므로 여기서 다르면 비정상
  if (major !== device.center_id) {
    await recordDailyFailure("ble", failKey);
    return NextResponse.json({ error: "확인할 수 없는 신호예요", code: "bad_code" }, { status: 403 });
  }

  const { data: center } = await supabase
    .from("crm_centers")
    .select("id, name, status, kiosk_token")
    .eq("id", device.center_id)
    .maybeSingle();
  const c = center as { id: number; name: string; status: string; kiosk_token: string | null } | null;
  if (!c || c.status !== "active" || !c.kiosk_token) {
    return NextResponse.json({ error: "센터 정보를 찾을 수 없어요", code: "no_center" }, { status: 404 });
  }

  if (!verifyBleMinor(c.id, c.kiosk_token, minor)) {
    await recordDailyFailure("ble", failKey);
    return NextResponse.json({ error: "확인할 수 없는 신호예요", code: "bad_code" }, { status: 403 });
  }

  // 앱 연결이 풀린 회원(탈퇴·연결 해제)의 남은 토큰은 쓰지 않는다
  const { data: mem } = await supabase
    .from("crm_members")
    .select("linked_firebase_uid")
    .eq("id", device.member_id)
    .eq("center_id", c.id)
    .maybeSingle();
  if (!(mem as { linked_firebase_uid?: string | null } | null)?.linked_firebase_uid) {
    return NextResponse.json({ error: "다시 설정이 필요해요", code: "revoked" }, { status: 401 });
  }

  // 4시간 안에 이미 출석한 회원 → 근처를 다시 지나가도 출석·확인창 없음
  const { data: recent } = await supabase
    .from("crm_attendances")
    .select("id")
    .eq("center_id", c.id)
    .eq("member_id", device.member_id)
    .gte("checked_in_at", new Date(Date.now() - BLE_REENTRY_BLOCK_MS).toISOString())
    .limit(1);
  if ((recent ?? []).length > 0) {
    return NextResponse.json({ ok: true, result: "duplicate", center_name: c.name, can_enter: null, mileage_awarded: 0 });
  }

  const result = await memberSelfCheckIn(c.id, device.member_id, "ble");
  if ("error" in result) {
    const detail = "detail" in result ? result.detail : undefined;
    return NextResponse.json({ error: result.error, detail: errLogOnly(detail) }, { status: result.status });
  }

  const deviceId = device.id;
  after(async () => {
    await supabase
      .from("crm_member_ble_devices")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", deviceId);
  });

  const duplicate = "duplicate" in result && result.duplicate === true;
  const summary = "summary" in result ? result.summary : undefined;
  return NextResponse.json({
    ok: true,
    result: duplicate ? "duplicate" : "checked_in",
    center_name: c.name,
    // false = 입장 자격 없음(회원권 만료·홀딩 등) → 회원 폰에 카운터 문의 안내
    can_enter: duplicate ? null : summary ? summary.can_enter && !summary.not_started : null,
    mileage_awarded: "mileage_awarded" in result ? result.mileage_awarded : 0,
  });
}
