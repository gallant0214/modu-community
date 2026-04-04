import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/jobs/latest?limit=3 — 최신 구인글 (홈 화면용)
// GET /api/jobs/latest?page=1&limit=20 — 페이지네이션 (전용 페이지용)
export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 3, 50);
  const page = Math.max(Number(url.searchParams.get("page")) || 1, 1);
  const offset = (page - 1) * limit;

  // 페이지네이션 지원 (page 파라미터가 있을 때)
  if (url.searchParams.has("page")) {
    const countResult = await sql`
      SELECT COUNT(*)::int AS total FROM job_posts
    `;
    const total = countResult[0]?.total || 0;
    const totalPages = Math.ceil(total / limit) || 1;

    const rows = await sql`
      SELECT * FROM job_posts
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return NextResponse.json({ posts: rows, page, totalPages, total });
  }

  // 기존: 단순 리스트 (홈 화면용)
  const rows = await sql`
    SELECT * FROM job_posts
    WHERE is_closed = false
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;

  return NextResponse.json(rows);
}
