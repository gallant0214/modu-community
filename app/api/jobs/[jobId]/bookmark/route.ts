import { sql } from "@/app/lib/db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/jobs/[jobId]/bookmark — 북마크 토글 (IP 기반)
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const id = Number(jobId);

  // 테이블 자동 생성
  await sql`
    CREATE TABLE IF NOT EXISTS job_post_bookmarks (
      id SERIAL PRIMARY KEY,
      job_post_id INT NOT NULL REFERENCES job_posts(id) ON DELETE CASCADE,
      ip_address TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(job_post_id, ip_address)
    )
  `;

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";

  const existing = await sql`
    SELECT id FROM job_post_bookmarks WHERE job_post_id = ${id} AND ip_address = ${ip}
  `;

  let unbookmarked = false;
  if (existing.length > 0) {
    await sql`DELETE FROM job_post_bookmarks WHERE job_post_id = ${id} AND ip_address = ${ip}`;
    unbookmarked = true;
  } else {
    await sql`INSERT INTO job_post_bookmarks (job_post_id, ip_address) VALUES (${id}, ${ip})`;
  }

  const rows = await sql`
    SELECT COUNT(*)::int AS count FROM job_post_bookmarks WHERE job_post_id = ${id}
  `;

  return NextResponse.json({
    unbookmarked,
    bookmark_count: rows[0]?.count || 0,
  });
}

// GET /api/jobs/[jobId]/bookmark — 북마크 수 조회
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const id = Number(jobId);

  // 테이블 없을 수도 있으므로 안전하게 처리
  try {
    const rows = await sql`
      SELECT COUNT(*)::int AS count FROM job_post_bookmarks WHERE job_post_id = ${id}
    `;
    return NextResponse.json({ bookmark_count: rows[0]?.count || 0 });
  } catch {
    return NextResponse.json({ bookmark_count: 0 });
  }
}
