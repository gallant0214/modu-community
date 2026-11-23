import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { authDevice } from "@/app/lib/crm-onnuri";

export const dynamic = "force-dynamic";

/**
 * GET  /api/onnuri/device  — 연결 상태 확인 + 살아 있음 표시(앱이 15분마다)
 * POST /api/onnuri/device { source_package } — 알림을 읽을 앱(온누리 가맹점 앱) 지정
 */
export async function GET(request: Request) {
  const device = await authDevice(request);
  if (!device) return NextResponse.json({ error: "연결이 끊긴 기기예요" }, { status: 401 });
  const { data: center } = await supabase.from("crm_centers").select("name").eq("id", device.center_id).maybeSingle();
  return NextResponse.json({
    ok: true,
    deviceName: device.name,
    centerName: (center as { name?: string } | null)?.name ?? "",
    sourcePackage: device.source_package,
  });
}

export async function POST(request: Request) {
  const device = await authDevice(request);
  if (!device) return NextResponse.json({ error: "연결이 끊긴 기기예요" }, { status: 401 });
  let body: { source_package?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const pkg = String(body.source_package ?? "").trim();
  if (!/^[A-Za-z0-9_.]{3,200}$/.test(pkg)) return NextResponse.json({ error: "앱을 다시 골라 주세요" }, { status: 400 });
  await supabase.from("crm_onnuri_devices").update({ source_package: pkg } as never).eq("id", device.id);
  return NextResponse.json({ ok: true });
}
