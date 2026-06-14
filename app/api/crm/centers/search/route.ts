import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { verifyAuth } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/centers/search?q=...
 * 일반 강사가 본인 소속 센터를 찾기 위한 검색.
 * - kind='center' 만 (solo 가상 센터는 제외)
 * - status='active' 만
 * - 이름 LIKE 매칭, 빈 쿼리는 빈 결과
 *
 * 회원 정보는 노출하지 않고 센터의 공개 정보만(이름/지역/연락처) 반환.
 */
export async function GET(request: Request) {
  const user = await verifyAuth(request);
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();

  if (q.length < 1) {
    return NextResponse.json({ centers: [] });
  }

  // 부분 일치 (이름 기준). 너무 광범위한 결과 방지를 위해 limit 20.
  const { data, error } = await supabase
    .from("crm_centers")
    .select("id, name, region_sido, region_sigungu, phone")
    .eq("kind", "center")
    .eq("status", "active")
    .ilike("name", `%${q}%`)
    .order("name", { ascending: true })
    .limit(20);

  if (error) {
    return NextResponse.json(
      { error: "검색 실패", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ centers: data ?? [] });
}
