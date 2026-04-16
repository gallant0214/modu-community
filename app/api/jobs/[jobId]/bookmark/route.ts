import { sql } from "@/app/lib/db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS job_post_bookmarks (
      id SERIAL PRIMARY KEY,
      job_post_id INT NOT NULL REFERENCES job_posts(id) ON DELETE CASCADE,
      ip_address TEXT NOT NULL,
      firebase_uid TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(job_post_id, ip_address)
    )
  `;
  // 기존의 (job_post_id, ip_address) UNIQUE 제약은 같은 기기/IP의 여러 계정을 차단하므로 제거
  try { await sql`ALTER TABLE job_post_bookmarks DROP CONSTRAINT IF EXISTS job_post_bookmarks_job_post_id_ip_address_key`; } catch {}
  // 인증 사용자는 (job_post_id, firebase_uid)로 유니크 보장
  try { await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_job_bm_uid ON job_post_bookmarks (job_post_id, firebase_uid) WHERE firebase_uid IS NOT NULL`; } catch {}
  // 익명 사용자는 (job_post_id, ip_address)로 유니크 보장 (firebase_uid가 null일 때만)
  try { await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_job_bm_ip ON job_post_bookmarks (job_post_id, ip_address) WHERE firebase_uid IS NULL`; } catch {}
}

// POST /api/jobs/[jobId]/bookmark — 북마크 토글
export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const id = Number(jobId);
  await ensureTable();

  const user = await verifyAuth(request);
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";

  let unbookmarked = false;

  if (user) {
    // UID 기반 토글
    const existing = await sql`SELECT id FROM job_post_bookmarks WHERE job_post_id = ${id} AND firebase_uid = ${user.uid}`;
    if (existing.length > 0) {
      await sql`DELETE FROM job_post_bookmarks WHERE job_post_id = ${id} AND firebase_uid = ${user.uid}`;
      unbookmarked = true;
    } else {
      await sql`INSERT INTO job_post_bookmarks (job_post_id, ip_address, firebase_uid) VALUES (${id}, ${ip}, ${user.uid})`;
    }
  } else {
    // IP 기반 폴백 (익명)
    const existing = await sql`SELECT id FROM job_post_bookmarks WHERE job_post_id = ${id} AND ip_address = ${ip} AND firebase_uid IS NULL`;
    if (existing.length > 0) {
      await sql`DELETE FROM job_post_bookmarks WHERE job_post_id = ${id} AND ip_address = ${ip} AND firebase_uid IS NULL`;
      unbookmarked = true;
    } else {
      await sql`INSERT INTO job_post_bookmarks (job_post_id, ip_address) VALUES (${id}, ${ip})`;
    }
  }

  const rows = await sql`SELECT COUNT(*)::int AS count FROM job_post_bookmarks WHERE job_post_id = ${id}`;
  return NextResponse.json({ unbookmarked, bookmark_count: rows[0]?.count || 0 });
}

// GET /api/jobs/[jobId]/bookmark — 북마크 상태 조회
export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const id = Number(jobId);

  try {
    await ensureTable();
    const user = await verifyAuth(request);
    const rows = await sql`SELECT COUNT(*)::int AS count FROM job_post_bookmarks WHERE job_post_id = ${id}`;

    let bookmarked = false;
    if (user) {
      const check = await sql`SELECT id FROM job_post_bookmarks WHERE job_post_id = ${id} AND firebase_uid = ${user.uid}`;
      bookmarked = check.length > 0;
    }

    return NextResponse.json({ bookmark_count: rows[0]?.count || 0, bookmarked });
  } catch {
    return NextResponse.json({ bookmark_count: 0, bookmarked: false });
  }
}
