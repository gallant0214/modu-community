import { sql } from "@/app/lib/db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const { postId } = await params;
  const id = Number(postId);

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";

  await sql`CREATE TABLE IF NOT EXISTS post_likes (
    id SERIAL PRIMARY KEY,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    ip_address TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(post_id, ip_address)
  )`;

  const existing = await sql`SELECT id FROM post_likes WHERE post_id = ${id} AND ip_address = ${ip}`;
  if (existing.length > 0) {
    await sql`DELETE FROM post_likes WHERE post_id = ${id} AND ip_address = ${ip}`;
    await sql`UPDATE posts SET likes = GREATEST(COALESCE(likes, 0) - 1, 0) WHERE id = ${id}`;
    return NextResponse.json({ unliked: true });
  }

  await sql`INSERT INTO post_likes (post_id, ip_address) VALUES (${id}, ${ip})`;
  await sql`UPDATE posts SET likes = COALESCE(likes, 0) + 1 WHERE id = ${id}`;
  return NextResponse.json({ unliked: false });
}
