import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { getClientIp } from "@/app/lib/security";
import { createHash } from "crypto";

export const dynamic = "force-dynamic";

/** 개발/내부 호스트 — KPI 집계에서 영구 제외 */
const isLocalHostname = (h: string): boolean => {
  const lower = h.toLowerCase();
  return (
    lower === "localhost" ||
    lower === "127.0.0.1" ||
    lower === "::1" ||
    lower.startsWith("192.168.") ||
    lower.startsWith("10.") ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(lower) ||
    lower.endsWith(".local")
  );
};

// POST /api/track-visit
// 클라이언트에서 sendBeacon/fetch 로 호출 — 가벼운 로깅
// body: { path }
export async function POST(request: Request) {
  try {
    const { path, referrer } = await request.json().catch(() => ({ path: "/", referrer: "" }));

    // 서버 측 localhost 가드 — 클라이언트 필터가 실패하거나 우회된 경우 대비.
    // 요청의 host(헤더) 또는 referrer 가 로컬 호스트이면 기록 자체를 건너뜀.
    const reqHost = (request.headers.get("host") || "").split(":")[0];
    if (reqHost && isLocalHostname(reqHost)) {
      return new NextResponse(null, { status: 204 });
    }
    if (typeof referrer === "string" && referrer) {
      try {
        const refHost = new URL(referrer).hostname;
        if (isLocalHostname(refHost)) {
          return new NextResponse(null, { status: 204 });
        }
      } catch { /* invalid URL — 무시 */ }
    }

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
