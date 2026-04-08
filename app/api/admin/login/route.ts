import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { checkRateLimit, getClientIp } from "@/app/lib/security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // 관리자 로그인 brute force 방지
  const ip = getClientIp(request);
  const rateLimitResponse = checkRateLimit(ip, "auth");
  if (rateLimitResponse) return rateLimitResponse;

  const body = await request.json();
  const { password } = body;

  const authError = await verifyAdmin(request, password);
  if (authError) return authError;

  await sql`ALTER TABLE reports ADD COLUMN IF NOT EXISTS target_hidden BOOLEAN DEFAULT false`;
  const reports = await sql`
    SELECT r.*,
      p.title AS post_title, p.author AS post_author,
      c.content AS comment_content, c.author AS comment_author,
      cat.name AS category_name,
      jp.title AS job_post_title, jp.center_name AS job_post_author
    FROM reports r
    LEFT JOIN posts p ON r.target_type = 'post' AND r.target_id = p.id
    LEFT JOIN comments c ON r.target_type = 'comment' AND r.target_id = c.id
    LEFT JOIN categories cat ON r.target_type != 'job_post' AND r.category_id = cat.id
    LEFT JOIN job_posts jp ON r.target_type = 'job_post' AND r.target_id = jp.id
    ORDER BY r.created_at DESC
  `;

  await sql`ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS email TEXT DEFAULT ''`;
  await sql`ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE`;
  const inquiries = await sql`
    SELECT id, author, email, title, content, reply, replied_at, hidden, read_at, created_at
    FROM inquiries ORDER BY created_at DESC
  `;

  return NextResponse.json({ reports, inquiries });
}
