import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { password } = body;

  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
  }

  const rows = await sql`SELECT target_type, target_id FROM reports WHERE id = ${Number(id)}`;
  if (rows.length === 0) {
    return NextResponse.json({ error: "신고를 찾을 수 없습니다" }, { status: 404 });
  }

  const { target_type, target_id } = rows[0];

  if (target_type === "job_post") {
    await sql`ALTER TABLE job_posts ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT false`;
    await sql`UPDATE job_posts SET hidden = true WHERE id = ${target_id}`;
  } else if (target_type === "post") {
    await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT false`;
    await sql`UPDATE posts SET hidden = true WHERE id = ${target_id}`;
  } else {
    await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT false`;
    await sql`UPDATE comments SET hidden = true WHERE id = ${target_id}`;
  }

  return NextResponse.json({ success: true });
}
