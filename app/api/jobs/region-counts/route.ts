import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/jobs/region-counts
// Returns { counts: { regionCode: number }, todayRegions: string[] }
export async function GET() {
  try {
    const countRows = await sql`
      SELECT region_code, COUNT(*)::int AS cnt
      FROM job_posts
      GROUP BY region_code
    `;

    const todayRows = await sql`
      SELECT DISTINCT region_code
      FROM job_posts
      WHERE created_at >= CURRENT_DATE
    `;

    const counts: Record<string, number> = {};
    for (const row of countRows) {
      if (row.region_code) {
        counts[row.region_code] = row.cnt;
      }
    }

    const todayRegions = todayRows
      .map((r: any) => r.region_code)
      .filter(Boolean);

    return NextResponse.json({ counts, todayRegions });
  } catch (e) {
    console.error("GET /api/jobs/region-counts error:", e);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
