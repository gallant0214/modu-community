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

  const rows = await sql`SELECT target_type, target_id, post_id, category_id FROM reports WHERE id = ${Number(id)}`;
  if (rows.length === 0) {
    return NextResponse.json({ error: "신고를 찾을 수 없습니다" }, { status: 404 });
  }

  const { target_type, target_id, post_id } = rows[0];

  if (target_type === "job_post") {
    await sql`DELETE FROM job_post_likes WHERE job_post_id = ${target_id}`;
    await sql`DELETE FROM job_posts WHERE id = ${target_id}`;
  } else if (target_type === "post") {
    await sql`DELETE FROM comments WHERE post_id = ${target_id}`;
    await sql`DELETE FROM posts WHERE id = ${target_id}`;
  } else {
    await sql`DELETE FROM comments WHERE id = ${target_id}`;
    await sql`UPDATE posts SET comments_count = (SELECT COUNT(*) FROM comments WHERE post_id = ${post_id}) WHERE id = ${post_id}`;
  }

  await sql`UPDATE reports SET resolved = true, resolved_at = NOW(), deleted_at = NOW() WHERE id = ${Number(id)}`;
  return NextResponse.json({ success: true });
}
