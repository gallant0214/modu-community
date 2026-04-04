import { sql } from "@/app/lib/db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ commentId: string }> }
) {
  const { commentId } = await params;
  const cid = Number(commentId);

  await sql`
    CREATE TABLE IF NOT EXISTS comment_likes (
      id SERIAL PRIMARY KEY,
      comment_id INT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
      ip_address TEXT NOT NULL DEFAULT '',
      firebase_uid TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE comment_likes ADD COLUMN IF NOT EXISTS firebase_uid TEXT`;

  const user = await verifyAuth(request);
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";

  let unliked = false;

  if (user) {
    // UID 기반
    const existing = await sql`SELECT id FROM comment_likes WHERE comment_id = ${cid} AND firebase_uid = ${user.uid}`;
    if (existing.length > 0) {
      await sql`DELETE FROM comment_likes WHERE comment_id = ${cid} AND firebase_uid = ${user.uid}`;
      unliked = true;
    } else {
      try { await sql`INSERT INTO comment_likes (comment_id, ip_address, firebase_uid) VALUES (${cid}, ${ip}, ${user.uid})`; } catch {}
    }
  } else {
    // IP 기반 폴백
    const existing = await sql`SELECT id FROM comment_likes WHERE comment_id = ${cid} AND ip_address = ${ip} AND firebase_uid IS NULL`;
    if (existing.length > 0) {
      await sql`DELETE FROM comment_likes WHERE comment_id = ${cid} AND ip_address = ${ip} AND firebase_uid IS NULL`;
      unliked = true;
    } else {
      try { await sql`INSERT INTO comment_likes (comment_id, ip_address) VALUES (${cid}, ${ip})`; } catch {}
    }
  }

  if (unliked) {
    await sql`UPDATE comments SET likes = GREATEST(COALESCE(likes, 0) - 1, 0) WHERE id = ${cid}`;
  } else {
    await sql`UPDATE comments SET likes = COALESCE(likes, 0) + 1 WHERE id = ${cid}`;
  }

  const row = await sql`SELECT likes FROM comments WHERE id = ${cid}`;
  return NextResponse.json({ unliked, likes: row[0]?.likes || 0 });
}
