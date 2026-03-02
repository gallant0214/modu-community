import { sql } from "@/app/lib/db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ commentId: string }> }
) {
  const { commentId } = await params;
  const cid = Number(commentId);

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";

  const existing = await sql`SELECT id FROM comment_likes WHERE comment_id = ${cid} AND ip_address = ${ip}`;
  if (existing.length > 0) {
    await sql`DELETE FROM comment_likes WHERE comment_id = ${cid} AND ip_address = ${ip}`;
    await sql`UPDATE comments SET likes = GREATEST(COALESCE(likes, 0) - 1, 0) WHERE id = ${cid}`;
    return NextResponse.json({ unliked: true });
  }

  await sql`INSERT INTO comment_likes (comment_id, ip_address) VALUES (${cid}, ${ip})`;
  await sql`UPDATE comments SET likes = COALESCE(likes, 0) + 1 WHERE id = ${cid}`;
  return NextResponse.json({ unliked: false });
}
