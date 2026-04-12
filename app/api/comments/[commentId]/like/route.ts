import { sql } from "@/app/lib/db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ commentId: string }> }
) {
  const user = await verifyAuth(request);
  if (!user) {
    return NextResponse.json({ error: "로그인을 해주세요" }, { status: 401 });
  }

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
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";

  const existing = await sql`SELECT id FROM comment_likes WHERE comment_id = ${cid} AND firebase_uid = ${user.uid}`;
  let unliked = false;

  if (existing.length > 0) {
    await sql`DELETE FROM comment_likes WHERE comment_id = ${cid} AND firebase_uid = ${user.uid}`;
    await sql`UPDATE comments SET likes = GREATEST(COALESCE(likes, 0) - 1, 0) WHERE id = ${cid}`;
    unliked = true;
  } else {
    try { await sql`INSERT INTO comment_likes (comment_id, ip_address, firebase_uid) VALUES (${cid}, ${ip}, ${user.uid})`; } catch {}
    await sql`UPDATE comments SET likes = COALESCE(likes, 0) + 1 WHERE id = ${cid}`;
  }

  const row = await sql`SELECT likes FROM comments WHERE id = ${cid}`;
  return NextResponse.json({ unliked, likes: row[0]?.likes || 0 });
}
