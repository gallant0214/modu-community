import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { hashDeviceToken, newDeviceToken } from "@/app/lib/crm-onnuri";
import { checkRateLimit, getClientIp, authFailureCount, recordAuthFailure } from "@/app/lib/security";

export const dynamic = "force-dynamic";

/**
 * POST /api/onnuri/pair { code } — 카운터 공기계의 '온누리 알림 앱' 연결.
 * CRM 센터설정에서 만든 6자리 코드(10분 유효)를 넣으면 기기 토큰을 한 번만 돌려준다.
 * 토큰 원문은 저장하지 않는다(해시만).
 */
export async function POST(request: Request) {
  // 6자리 코드라 대입 시도를 막는다 — 1분에 5회 + 틀린 횟수 누적 차단
  const ip = getClientIp(request);
  const limited = await checkRateLimit(ip, "auth");
  if (limited) return limited;
  if ((await authFailureCount("onnuri-pair", ip)) >= 5) {
    return NextResponse.json({ error: "잠시 후 다시 시도해 주세요" }, { status: 429 });
  }
  let body: { code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const code = String(body.code ?? "").replace(/\D/g, "");
  if (code.length !== 6) return NextResponse.json({ error: "6자리 연결 코드를 입력해 주세요" }, { status: 400 });

  const { data } = await supabase
    .from("crm_onnuri_devices")
    .select("id, center_id, name, pair_code_expires_at, revoked_at")
    .eq("pair_code", code)
    .is("revoked_at", null)
    .maybeSingle();
  const dev = data as { id: number; center_id: number; name: string; pair_code_expires_at: string | null } | null;
  if (!dev || !dev.pair_code_expires_at || new Date(dev.pair_code_expires_at).getTime() < Date.now()) {
    await recordAuthFailure("onnuri-pair", ip);
    return NextResponse.json({ error: "코드가 맞지 않거나 시간이 지났어요. CRM에서 새 코드를 만들어 주세요" }, { status: 400 });
  }

  const token = newDeviceToken();
  const { data: took } = await supabase
    .from("crm_onnuri_devices")
    .update({
      token_hash: hashDeviceToken(token),
      pair_code: null,
      pair_code_expires_at: null,
      paired_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    } as never)
    .eq("id", dev.id)
    .eq("pair_code", code) // 같은 코드로 두 기기가 동시에 연결되지 않게
    .select("id");
  if ((took ?? []).length === 0) {
    return NextResponse.json({ error: "이미 사용된 코드예요" }, { status: 409 });
  }

  const { data: center } = await supabase.from("crm_centers").select("name").eq("id", dev.center_id).maybeSingle();
  return NextResponse.json({
    ok: true,
    token,
    deviceName: dev.name,
    centerName: (center as { name?: string } | null)?.name ?? "",
  });
}
