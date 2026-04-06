import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import { sanitize, validateLength } from "@/app/lib/security";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/notices
 * Body: { password, title, content }
 * 새 공지 게시글 생성 (is_notice = true)
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { password, title, content } = body;

  const authError = await verifyAdmin(request, password);
  if (authError) return authError;

  if (!title?.trim() || !content?.trim()) {
    return NextResponse.json({ error: "제목과 내용을 입력해주세요" }, { status: 400 });
  }

  const rows = await sql`
    INSERT INTO posts (category_id, title, content, author, password, is_notice, firebase_uid)
    VALUES (1, ${sanitize(validateLength(title.trim(), 200))}, ${sanitize(validateLength(content.trim(), 50000))}, '관리자', ${password}, true, '')
    RETURNING id
  `;

  return NextResponse.json({ success: true, id: rows[0].id });
}
