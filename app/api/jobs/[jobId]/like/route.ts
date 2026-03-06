import { sql } from "@/app/lib/db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const id = Number(jobId);

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";

  const existing = await sql`
    SELECT id FROM job_post_likes WHERE job_post_id = ${id} AND ip_address = ${ip}
  `;

  let unliked = false;
  if (existing.length > 0) {
    await sql`DELETE FROM job_post_likes WHERE job_post_id = ${id} AND ip_address = ${ip}`;
    await sql`UPDATE job_posts SET likes = GREATEST(likes - 1, 0) WHERE id = ${id}`;
    unliked = true;
  } else {
    await sql`INSERT INTO job_post_likes (job_post_id, ip_address) VALUES (${id}, ${ip})`;
    await sql`UPDATE job_posts SET likes = likes + 1 WHERE id = ${id}`;
  }

  const rows = await sql`SELECT likes FROM job_posts WHERE id = ${id}`;
  return NextResponse.json({ unliked, likes: rows[0]?.likes || 0 });
}
