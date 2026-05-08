import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { REGION_GROUPS } from "@/app/lib/region-data";

export const dynamic = "force-dynamic";

// 시·도/시·군·구 이름 → 코드 매핑 — trade_posts 가 텍스트 컬럼 기반이라 매핑 후 카운트
const SIDO_NAME_TO_CODE: Record<string, string> = {};
const SUB_NAME_TO_CODE: Record<string, Record<string, string>> = {};
for (const g of REGION_GROUPS) {
  const sidoCode = g.code.toLowerCase();
  SIDO_NAME_TO_CODE[g.name] = sidoCode;
  SUB_NAME_TO_CODE[sidoCode] = {};
  for (const s of g.subRegions) {
    SUB_NAME_TO_CODE[sidoCode][s.name] = s.code.toLowerCase();
  }
}

// GET /api/trade/region-counts
//   counts:        { [code]: cnt }   — 시·도 코드는 sido 합계, 시·군·구 코드는 해당 sigungu 카운트
//   todayRegions:  최근 24h 내 글이 등록된 시·도 코드 배열 (구인탭과 동일 패턴)
export async function GET() {
  try {
    // 활성 글의 (sido, sigungu) 만 가져와 JS group-by
    const { data, error } = await supabase
      .from("trade_posts")
      .select("region_sido, region_sigungu, created_at")
      .eq("status", "active");
    if (error) throw error;

    const counts: Record<string, number> = {};
    const todaySet = new Set<string>();
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    for (const row of data || []) {
      const sido = String(row.region_sido || "").trim();
      const sigungu = String(row.region_sigungu || "").trim();
      const sidoCode = SIDO_NAME_TO_CODE[sido];
      if (!sidoCode) continue;

      counts[sidoCode] = (counts[sidoCode] || 0) + 1;
      if (sigungu) {
        const subCode = SUB_NAME_TO_CODE[sidoCode]?.[sigungu];
        if (subCode) counts[subCode] = (counts[subCode] || 0) + 1;
      }

      if (row.created_at && new Date(row.created_at).getTime() >= oneDayAgo) {
        todaySet.add(sidoCode);
      }
    }

    return NextResponse.json({ counts, todayRegions: Array.from(todaySet) });
  } catch (e) {
    console.error("GET /api/trade/region-counts error:", e);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
