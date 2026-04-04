import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";
import { sanitize, validateLength } from "@/app/lib/security";
import { verifyAdminPassword } from "@/app/lib/admin-auth";
import { verifyAuth } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인을 해주세요" }, { status: 401 });
  const { id } = await params;
  const body = await request.json();
  const { password, title, content } = body;

  const rows = await sql`SELECT password FROM inquiries WHERE id = ${Number(id)}`;
  if (rows.length === 0) {
    return NextResponse.json({ error: "문의를 찾을 수 없습니다" }, { status: 404 });
  }

  const isAdmin = await verifyAdminPassword(password);
  if (!isAdmin && rows[0].password !== password) {
    return NextResponse.json({ error: "비밀번호가 일치하지 않습니다" }, { status: 403 });
  }

  if (!title?.trim() || !content?.trim()) {
    return NextResponse.json({ error: "제목과 내용을 입력해주세요" }, { status: 400 });
  }

  const safeTitle = sanitize(validateLength(title.trim(), 200));
  const safeContent = sanitize(validateLength(content.trim(), 5000));
  await sql`UPDATE inquiries SET title = ${safeTitle}, content = ${safeContent} WHERE id = ${Number(id)}`;
  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userDel = await verifyAuth(request);
  if (!userDel) return NextResponse.json({ error: "로그인을 해주세요" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const { password } = body;

  const rows = await sql`SELECT password FROM inquiries WHERE id = ${Number(id)}`;
  if (rows.length === 0) {
    return NextResponse.json({ error: "문의를 찾을 수 없습니다" }, { status: 404 });
  }

  const isAdmin = await verifyAdminPassword(password);
  if (!isAdmin && rows[0].password !== password) {
    return NextResponse.json({ error: "비밀번호가 일치하지 않습니다" }, { status: 403 });
  }

  await sql`DELETE FROM inquiries WHERE id = ${Number(id)}`;
  return NextResponse.json({ success: true });
}
