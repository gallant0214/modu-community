import { supabase } from "@/app/lib/supabase";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const VALID_SCOPES = new Set(["community", "jobs", "trade"]);
const VALID_PLATFORMS = new Set(["web", "ios", "android"]);

// POST /api/search/log
// body: { query, scope: 'community'|'jobs'|'trade', search_type?, result_count?, platform }
// 사용자 검색어를 익명/로그인 모두 기록. result_count=0 인 검색은 '못 채우는 수요' 분석에 사용.
// 너무 짧은 쿼리(1자) 또는 빈 쿼리는 저장 안 함.
export async function POST(request: Request) {
  try {
    const user = await verifyAuth(request).catch(() => null);
    const body = await request.json().catch(() => ({}));
    const query = typeof body?.query === "string" ? body.query.trim().slice(0, 200) : "";
    const scope = String(body?.scope || "").toLowerCase();
    const searchType = typeof body?.search_type === "string" ? body.search_type.slice(0, 40) : null;
    const resultCount = typeof body?.result_count === "number" && Number.isFinite(body.result_count)
      ? Math.max(0, Math.floor(body.result_count))
      : null;
    const platform = String(body?.platform || "").toLowerCase();

    if (!query || query.length < 2) return NextResponse.json({ ok: false }, { status: 200 });
    if (!VALID_SCOPES.has(scope) || !VALID_PLATFORMS.has(platform)) {
      return NextResponse.json({ ok: false, error: "invalid params" }, { status: 400 });
    }

    await (supabase as any).from("search_logs").insert({
      query,
      scope,
      search_type: searchType,
      result_count: resultCount,
      firebase_uid: user?.uid || null,
      platform,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
