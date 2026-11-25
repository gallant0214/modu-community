import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";
import { checkRateLimit, getClientIp } from "@/app/lib/security";
import { BLE_BEACON_UUID, bleMeasuredPowerFor, hashBleDeviceToken, makeBleDeviceToken } from "@/app/lib/ble-beacon";

export const dynamic = "force-dynamic";

/**
 * 블루투스 자동 출석 — 기기 전용 출석 토큰 발급/폐기.
 * 앱이 꺼져 있을 때 OS 가 깨운 네이티브 코드는 로그인 토큰(Firebase JS)을 쓸 수 없어서,
 * 회원이 설정에서 기능을 켤 때(로그인 상태) 이 기기 전용 토큰을 한 번 발급한다.
 * - 서버에는 해시만 저장. 원문은 응답으로 한 번만 내려가고 기기 보안 저장소에 보관.
 * - 이 토큰은 /api/crm/member-app/ble-check-in 에서만 통한다.
 * - 회원당 1대: 새로 켜면 이전 기기 토큰은 폐기된다.
 */

/** POST { centerId, platform: 'ios'|'android' } → { token, uuid, major } */
export async function POST(request: Request) {
  const limited = await checkRateLimit(getClientIp(request), "write");
  if (limited) return limited;

  let body: { centerId?: number; platform?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const platform = body.platform === "ios" || body.platform === "android" ? body.platform : null;
  if (!platform) return NextResponse.json({ error: "지원하지 않는 기기예요" }, { status: 400 });

  const ctx = await requireMemberForCenter(request, Number(body.centerId));
  if (isMemberError(ctx)) return ctx;
  if (ctx.centerId > 0xffff) {
    return NextResponse.json({ error: "지원하지 않는 센터예요" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { error: revokeErr } = await supabase
    .from("crm_member_ble_devices")
    .update({ revoked_at: now })
    .eq("member_id", ctx.memberId)
    .is("revoked_at", null);
  if (revokeErr) return NextResponse.json({ error: "등록 실패" }, { status: 500 });

  const token = makeBleDeviceToken();
  const { error } = await supabase.from("crm_member_ble_devices").insert({
    center_id: ctx.centerId,
    member_id: ctx.memberId,
    token_hash: hashBleDeviceToken(token),
    platform,
  });
  if (error) return NextResponse.json({ error: "등록 실패" }, { status: 500 });

  return NextResponse.json(
    { ok: true, token, uuid: BLE_BEACON_UUID, major: ctx.centerId, measured_power: await bleMeasuredPowerFor(ctx.centerId) },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/** DELETE { centerId } — 기능 끄기·로그아웃 시 이 회원의 기기 토큰 전부 폐기 */
export async function DELETE(request: Request) {
  let body: { centerId?: number };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const ctx = await requireMemberForCenter(request, Number(body.centerId));
  if (isMemberError(ctx)) return ctx;

  const { error } = await supabase
    .from("crm_member_ble_devices")
    .update({ revoked_at: new Date().toISOString() })
    .eq("member_id", ctx.memberId)
    .is("revoked_at", null);
  if (error) return NextResponse.json({ error: "해제 실패" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
