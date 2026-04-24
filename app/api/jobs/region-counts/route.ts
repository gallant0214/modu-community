import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";
import { REGION_GROUPS } from "@/app/lib/region-data";

export const dynamic = "force-dynamic";

// 이름 → 코드 매핑 미리 구성
// 예: NAME_TO_CODE["daegu"]["수성구"] = "DAEGU_SUSUNG"
const NAME_TO_CODE: Record<string, Record<string, string>> = {};
for (const g of REGION_GROUPS) {
  const parent = g.code.toLowerCase();
  NAME_TO_CODE[parent] = {};
  for (const s of g.subRegions) {
    NAME_TO_CODE[parent][s.name] = s.code;
  }
}

// GET /api/jobs/region-counts
// Returns { counts: { regionCode: number }, todayRegions: string[] }
// counts 는 상위 코드(예: "daegu") + 하위 코드(예: "daegu_susung") 둘 다 포함.
export async function GET() {
  try {
    // 1) 상위 지역(시/도) 카운트
    const topRows = await sql`
      SELECT LOWER(region_code) AS region_code, COUNT(*)::int AS cnt
      FROM job_posts
      WHERE region_code IS NOT NULL AND region_code <> ''
      GROUP BY LOWER(region_code)
    ` as { region_code: string; cnt: number }[];

    // 2) 하위 지역(구/시/군) 카운트 — region_name 에서 " - " 뒤 첫 단어 추출
    // region_name 예: "대구 - 수성구" / "경기 - 성남시 분당구" / "경기 - 고양시 덕양구"
    // 첫 단어("수성구", "성남시", "고양시") 만 추출해서 REGION_GROUPS 이름과 매칭.
    const subRows = await sql`
      SELECT
        LOWER(region_code) AS parent,
        substring(region_name from ' - ([^ ]+)') AS sub_name,
        COUNT(*)::int AS cnt
      FROM job_posts
      WHERE region_code IS NOT NULL AND region_code <> ''
        AND region_name LIKE '% - %'
      GROUP BY LOWER(region_code), substring(region_name from ' - ([^ ]+)')
    ` as { parent: string; sub_name: string; cnt: number }[];

    // 3) 오늘 등록된 지역들 (bade for "오늘 신규" 표시)
    const todayRows = await sql`
      SELECT DISTINCT LOWER(region_code) AS region_code
      FROM job_posts
      WHERE created_at >= CURRENT_DATE
        AND region_code IS NOT NULL AND region_code <> ''
    ` as { region_code: string }[];

    const counts: Record<string, number> = {};

    // 상위 코드 카운트
    for (const row of topRows) {
      if (row.region_code) counts[row.region_code] = row.cnt;
    }

    // 하위 코드 카운트 (이름 매칭 성공한 것만)
    for (const row of subRows) {
      const subCode = NAME_TO_CODE[row.parent]?.[row.sub_name];
      if (!subCode) continue;
      const key = subCode.toLowerCase();
      counts[key] = (counts[key] || 0) + row.cnt;
    }

    const todayRegions = todayRows.map(r => r.region_code).filter(Boolean);

    return NextResponse.json({ counts, todayRegions });
  } catch (e) {
    console.error("GET /api/jobs/region-counts error:", e);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
