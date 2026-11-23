import { NextResponse } from "next/server";
import { authDevice, ingestNotification } from "@/app/lib/crm-onnuri";

export const dynamic = "force-dynamic";

/**
 * POST /api/onnuri/notify — 공기계 '온누리 알림 앱'이 가맹점 앱 알림을 보낸다.
 * body: { package, title, text, postedAt(ms), key }
 * 같은 알림을 여러 번 보내도 한 번만 저장된다(앱 재전송 안전).
 */
export async function POST(request: Request) {
  const device = await authDevice(request);
  if (!device) return NextResponse.json({ error: "연결이 끊긴 기기예요. 다시 연결해 주세요" }, { status: 401 });

  let body: { package?: string; title?: string; text?: string; postedAt?: number; key?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  if (!body.package || !body.key) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const r = await ingestNotification(device, {
    package: String(body.package),
    title: String(body.title ?? ""),
    text: String(body.text ?? ""),
    postedAt: Number(body.postedAt) || Date.now(),
    key: String(body.key),
  });
  return NextResponse.json({ ok: true, ...r });
}
