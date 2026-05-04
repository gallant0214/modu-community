import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { getClientIp } from "@/app/lib/security";
import { createHash } from "crypto";

export const dynamic = "force-dynamic";

// POST /api/track-visit
// 클라이언트에서 sendBeacon/fetch 로 호출 — 가벼운 로깅
// body: { path }
export async function POST(request: Request) {
  try {
    const { path, referrer } = await request.json().catch(() => ({ path: "/", referrer: "" }));
    const ip = getClientIp(request);
    // IP 해시 (PII 회피 — 원본 IP 저장 안 함)
    const ip_hash = ip ? createHash("sha256").update(`${ip}:moducm-visit`).digest("hex").slice(0, 32) : null;

    // 자기 자신(moducm.com) 내부 이동은 referrer 무시 (외부 유입만 채널/키워드 집계)
    let ref: string | null = null;
    if (typeof referrer === "string" && referrer && !/^https?:\/\/(?:www\.)?moducm\.com/i.test(referrer)) {
      ref = referrer.slice(0, 500);
    }

    await (supabase as any).from("site_visits").insert({
      path: typeof path === "string" ? path.slice(0, 200) : "/",
      ip_hash,
      referrer: ref,
    });
    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 204 }); // 절대 사용자 흐름 막지 말 것
  }
}
