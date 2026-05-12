import { supabase } from "@/app/lib/supabase";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const VALID_PLATFORMS = new Set(["web", "ios", "android"]);

// POST /api/push/click
// body: { type: string, platform: 'web'|'ios'|'android', broadcast_id?: number }
// 사용자가 푸시 알림을 탭한 시점에 클라이언트가 호출 — CTR 분석용.
// 인증은 옵션 (비로그인 사용자가 알림 탭하는 경우는 거의 없지만 fallback)
export async function POST(request: Request) {
  try {
    const user = await verifyAuth(request).catch(() => null);
    const body = await request.json().catch(() => ({}));
    const type = typeof body?.type === "string" ? body.type.slice(0, 50) : "";
    const platform = String(body?.platform || "").toLowerCase();
    const broadcastId = typeof body?.broadcast_id === "number" && Number.isFinite(body.broadcast_id)
      ? Math.floor(body.broadcast_id)
      : null;

    if (!type || !VALID_PLATFORMS.has(platform)) {
      return NextResponse.json({ ok: false, error: "invalid params" }, { status: 400 });
    }

    await (supabase as any).from("push_clicks").insert({
      firebase_uid: user?.uid || null,
      broadcast_id: broadcastId,
      type,
      platform,
    });
    return NextResponse.json({ ok: true });
  } catch {
    // 사용자 흐름에 영향 주지 말 것
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
