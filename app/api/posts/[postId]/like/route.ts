import { sql } from "@/app/lib/db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const user = await verifyAuth(request);
  if (!user) {
    return NextResponse.json({ error: "로그인을 해주세요" }, { status: 401 });
  }

  const { postId } = await params;
  const id = Number(postId);

  await sql`
    CREATE TABLE IF NOT EXISTS post_likes (
      id SERIAL PRIMARY KEY,
      post_id INT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      ip_address TEXT NOT NULL DEFAULT '',
      firebase_uid TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE post_likes ADD COLUMN IF NOT EXISTS firebase_uid TEXT`;

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";

  const existing = await sql`SELECT id FROM post_likes WHERE post_id = ${id} AND firebase_uid = ${user.uid}`;
  let unliked = false;

  if (existing.length > 0) {
    await sql`DELETE FROM post_likes WHERE post_id = ${id} AND firebase_uid = ${user.uid}`;
    await sql`UPDATE posts SET likes = GREATEST(COALESCE(likes, 0) - 1, 0) WHERE id = ${id}`;
    unliked = true;
  } else {
    try { await sql`INSERT INTO post_likes (post_id, ip_address, firebase_uid) VALUES (${id}, ${ip}, ${user.uid})`; } catch {}
    await sql`UPDATE posts SET likes = COALESCE(likes, 0) + 1 WHERE id = ${id}`;
  }

  const row = await sql`SELECT likes FROM posts WHERE id = ${id}`;
  return NextResponse.json({ unliked, likes: row[0]?.likes || 0 });
}
