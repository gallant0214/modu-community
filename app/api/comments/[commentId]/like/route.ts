import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ commentId: string }> }
) {
  const user = await verifyAuth(request);
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const { commentId } = await params;
  const cid = Number(commentId);

  await sql`
    CREATE TABLE IF NOT EXISTS comment_likes (
      id SERIAL PRIMARY KEY,
      comment_id INT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
      ip_address TEXT NOT NULL DEFAULT '',
      firebase_uid TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(comment_id, ip_address)
    )
  `;
  await sql`ALTER TABLE comment_likes ADD COLUMN IF NOT EXISTS firebase_uid TEXT`;
  try { await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_comment_likes_uid ON comment_likes (comment_id, firebase_uid) WHERE firebase_uid IS NOT NULL`; } catch {}

  const existing = await sql`
    SELECT id FROM comment_likes WHERE comment_id = ${cid} AND firebase_uid = ${user.uid}
  `;

  if (existing.length > 0) {
    await sql`DELETE FROM comment_likes WHERE comment_id = ${cid} AND firebase_uid = ${user.uid}`;
    await sql`UPDATE comments SET likes = GREATEST(COALESCE(likes, 0) - 1, 0) WHERE id = ${cid}`;
    return NextResponse.json({ unliked: true });
  }

  await sql`INSERT INTO comment_likes (comment_id, ip_address, firebase_uid) VALUES (${cid}, '', ${user.uid})`;
  await sql`UPDATE comments SET likes = COALESCE(likes, 0) + 1 WHERE id = ${cid}`;
  return NextResponse.json({ unliked: false });
}
