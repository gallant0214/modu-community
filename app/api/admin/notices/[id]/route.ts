import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import { sanitize, validateLength } from "@/app/lib/security";

export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { password, title, content } = body;

  const authError = await verifyAdmin(request, password);
  if (authError) return authError;

  if (!title?.trim() || !content?.trim()) {
    return NextResponse.json({ error: "제목과 내용을 입력해주세요" }, { status: 400 });
  }

  const rows = await sql`SELECT id FROM posts WHERE id = ${Number(id)} AND is_notice = true`;
  if (rows.length === 0) {
    return NextResponse.json({ error: "공지를 찾을 수 없습니다" }, { status: 404 });
  }

  await sql`UPDATE posts SET title = ${sanitize(validateLength(title.trim(), 200))}, content = ${sanitize(validateLength(content.trim(), 50000))}, updated_at = NOW() WHERE id = ${Number(id)}`;
  return NextResponse.json({ success: true });
}
