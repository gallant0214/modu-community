import { supabase } from "@/app/lib/supabase";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { getClientIp } from "@/app/lib/security";
import { NextResponse } from "next/server";
import { createHash } from "crypto";

export const dynamic = "force-dynamic";

const VALID_PLATFORMS = new Set(["web", "ios", "android"]);

// POST /api/auth/login-log
// body: { platform: 'web' | 'ios' | 'android' }
// 로그인 직후 1회만 호출. 자동 토큰 갱신은 기록 X.
export async function POST(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const platform = String(body?.platform || "").toLowerCase();
  if (!VALID_PLATFORMS.has(platform)) {
    return NextResponse.json({ error: "platform invalid" }, { status: 400 });
  }

  // IP 는 해시만 저장 (개인정보 보호 + 분쟁 시 동일성 비교 가능)
  const ip = getClientIp(request) || "";
  const ipHash = ip
    ? createHash("sha256").update(`${ip}:${process.env.IP_HASH_SALT || "moducm"}`).digest("hex").slice(0, 24)
    : null;

  const ua = request.headers.get("user-agent") || null;

  const { error } = await (supabase as any).from("user_login_log").insert({
    firebase_uid: user.uid,
    platform,
    ip_hash: ipHash,
    user_agent: ua ? ua.slice(0, 500) : null,
  });

  if (error) {
    console.error("login-log insert error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
