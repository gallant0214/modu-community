import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";
import { cached } from "@/app/lib/cache";

export const dynamic = "force-dynamic";

// GET /api/jobs/latest?limit=3 — 최신 구인글 (홈 화면용)
// GET /api/jobs/latest?page=1&limit=20 — 페이지네이션 (전용 페이지용)
export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 3, 50);
  const page = Math.max(Number(url.searchParams.get("page")) || 1, 1);
  const offset = (page - 1) * limit;

  if (url.searchParams.has("page")) {
    const result = await cached(`jobs:latest:p:${page}:l:${limit}`, 60, async () => {
      const countResult = await sql`SELECT COUNT(*)::int AS total FROM job_posts`;
      const total = countResult[0]?.total || 0;
      const totalPages = Math.ceil(total / limit) || 1;
      const rows = await sql`SELECT * FROM job_posts ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
      return { posts: rows, page, totalPages, total };
    });
    return NextResponse.json(result);
  }

  // 홈 화면용 (60초 캐시)
  const rows = await cached(`jobs:latest:home:${limit}`, 60, () =>
    sql`SELECT * FROM job_posts WHERE is_closed = false ORDER BY created_at DESC LIMIT ${limit}`
  );
  return NextResponse.json(rows);
}
