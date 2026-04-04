import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { password } = body;

  const authError = await verifyAdmin(request, password);
  if (authError) return authError;

  const rows = await sql`SELECT target_type, target_id FROM reports WHERE id = ${Number(id)}`;
  if (rows.length === 0) {
    return NextResponse.json({ error: "신고를 찾을 수 없습니다" }, { status: 404 });
  }

  const { target_type, target_id } = rows[0];

  if (target_type === "job_post") {
    await sql`ALTER TABLE job_posts ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT false`;
    await sql`UPDATE job_posts SET hidden = false WHERE id = ${target_id}`;
  } else if (target_type === "post") {
    await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT false`;
    await sql`UPDATE posts SET hidden = false WHERE id = ${target_id}`;
  } else {
    await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT false`;
    await sql`UPDATE comments SET hidden = false WHERE id = ${target_id}`;
  }

  // 숨김 해제 시 처리 완료 취소 + 숨김 플래그 해제
  await sql`ALTER TABLE reports ADD COLUMN IF NOT EXISTS target_hidden BOOLEAN DEFAULT false`;
  await sql`UPDATE reports SET resolved = false, resolved_at = NULL, target_hidden = false WHERE id = ${Number(id)}`;

  return NextResponse.json({ success: true });
}
