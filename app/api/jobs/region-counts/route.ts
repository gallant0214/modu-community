import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { REGION_GROUPS } from "@/app/lib/region-data";

export const dynamic = "force-dynamic";

const NAME_TO_CODE: Record<string, Record<string, string>> = {};
for (const g of REGION_GROUPS) {
  const parent = g.code.toLowerCase();
  NAME_TO_CODE[parent] = {};
  for (const s of g.subRegions) {
    NAME_TO_CODE[parent][s.name] = s.code;
  }
}

// GET /api/jobs/region-counts
export async function GET() {
  try {
    const [topRes, subRes, todayRes] = await Promise.all([
      supabase.rpc("job_posts_region_counts"),
      supabase.rpc("job_posts_subregion_counts"),
      supabase.rpc("job_posts_today_regions"),
    ]);

    if (topRes.error || subRes.error || todayRes.error) {
      throw topRes.error || subRes.error || todayRes.error;
    }

    const counts: Record<string, number> = {};

    for (const row of topRes.data || []) {
      if (row.region_code) counts[row.region_code] = row.cnt;
    }

    for (const row of subRes.data || []) {
      const subCode = NAME_TO_CODE[row.parent]?.[row.sub_name];
      if (!subCode) continue;
      const key = subCode.toLowerCase();
      counts[key] = (counts[key] || 0) + row.cnt;
    }

    const todayRegions = (todayRes.data || []).map((r) => r.region_code).filter(Boolean);

    return NextResponse.json({ counts, todayRegions });
  } catch (e) {
    console.error("GET /api/jobs/region-counts error:", e);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
