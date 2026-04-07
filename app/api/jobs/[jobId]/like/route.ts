import { sql } from "@/app/lib/db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const id = Number(jobId);
  const user = await verifyAuth(request);

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";

  await sql`ALTER TABLE job_post_likes ADD COLUMN IF NOT EXISTS firebase_uid TEXT`;

  let unliked = false;

  if (user) {
    // firebase_uid 기반
    const existing = await sql`SELECT id FROM job_post_likes WHERE job_post_id = ${id} AND firebase_uid = ${user.uid}`;
    if (existing.length > 0) {
      await sql`DELETE FROM job_post_likes WHERE job_post_id = ${id} AND firebase_uid = ${user.uid}`;
      await sql`UPDATE job_posts SET likes = GREATEST(likes - 1, 0) WHERE id = ${id}`;
      unliked = true;
    } else {
      await sql`INSERT INTO job_post_likes (job_post_id, ip_address, firebase_uid) VALUES (${id}, ${ip}, ${user.uid})`;
      await sql`UPDATE job_posts SET likes = likes + 1 WHERE id = ${id}`;
    }
  } else {
    // IP 기반 (비로그인)
    const existing = await sql`SELECT id FROM job_post_likes WHERE job_post_id = ${id} AND ip_address = ${ip} AND firebase_uid IS NULL`;
    if (existing.length > 0) {
      await sql`DELETE FROM job_post_likes WHERE job_post_id = ${id} AND ip_address = ${ip} AND firebase_uid IS NULL`;
      await sql`UPDATE job_posts SET likes = GREATEST(likes - 1, 0) WHERE id = ${id}`;
      unliked = true;
    } else {
      await sql`INSERT INTO job_post_likes (job_post_id, ip_address) VALUES (${id}, ${ip})`;
      await sql`UPDATE job_posts SET likes = likes + 1 WHERE id = ${id}`;
    }
  }

  const rows = await sql`SELECT likes FROM job_posts WHERE id = ${id}`;
  return NextResponse.json({ unliked, likes: rows[0]?.likes || 0 });
}
