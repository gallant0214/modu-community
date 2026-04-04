import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS post_bookmarks (
      id SERIAL PRIMARY KEY,
      post_id INT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      firebase_uid TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(post_id, firebase_uid)
    )
  `;
}

// POST /api/posts/[postId]/bookmark — 북마크 토글 (로그인 필수)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { postId } = await params;
  const id = Number(postId);
  await ensureTable();

  const existing = await sql`SELECT id FROM post_bookmarks WHERE post_id = ${id} AND firebase_uid = ${user.uid}`;
  let unbookmarked = false;

  if (existing.length > 0) {
    await sql`DELETE FROM post_bookmarks WHERE post_id = ${id} AND firebase_uid = ${user.uid}`;
    unbookmarked = true;
  } else {
    await sql`INSERT INTO post_bookmarks (post_id, firebase_uid) VALUES (${id}, ${user.uid}) ON CONFLICT DO NOTHING`;
  }

  const rows = await sql`SELECT COUNT(*)::int AS count FROM post_bookmarks WHERE post_id = ${id}`;
  return NextResponse.json({ unbookmarked, bookmark_count: rows[0]?.count || 0 });
}

// GET /api/posts/[postId]/bookmark — 북마크 상태 조회
export async function GET(
  request: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const user = await verifyAuth(request);
  const { postId } = await params;
  const id = Number(postId);

  try {
    await ensureTable();
    const rows = await sql`SELECT COUNT(*)::int AS count FROM post_bookmarks WHERE post_id = ${id}`;
    let bookmarked = false;
    if (user) {
      const check = await sql`SELECT id FROM post_bookmarks WHERE post_id = ${id} AND firebase_uid = ${user.uid}`;
      bookmarked = check.length > 0;
    }
    return NextResponse.json({ bookmark_count: rows[0]?.count || 0, bookmarked });
  } catch {
    return NextResponse.json({ bookmark_count: 0, bookmarked: false });
  }
}
