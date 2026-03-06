import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/jobs/latest?limit=3 — 최신 구인글 (홈 화면용)
export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 3, 10);

  const rows = await sql`
    SELECT * FROM job_posts
    WHERE is_closed = false
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;

  return NextResponse.json(rows);
}
