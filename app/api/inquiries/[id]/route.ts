import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { password, title, content } = body;

  const rows = await sql`SELECT password FROM inquiries WHERE id = ${Number(id)}`;
  if (rows.length === 0) {
    return NextResponse.json({ error: "문의를 찾을 수 없습니다" }, { status: 404 });
  }

  const isAdmin = password === process.env.ADMIN_PASSWORD;
  if (!isAdmin && rows[0].password !== password) {
    return NextResponse.json({ error: "비밀번호가 일치하지 않습니다" }, { status: 403 });
  }

  if (!title?.trim() || !content?.trim()) {
    return NextResponse.json({ error: "제목과 내용을 입력해주세요" }, { status: 400 });
  }

  await sql`UPDATE inquiries SET title = ${title.trim()}, content = ${content.trim()} WHERE id = ${Number(id)}`;
  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { password } = body;

  const rows = await sql`SELECT password FROM inquiries WHERE id = ${Number(id)}`;
  if (rows.length === 0) {
    return NextResponse.json({ error: "문의를 찾을 수 없습니다" }, { status: 404 });
  }

  const isAdmin = password === process.env.ADMIN_PASSWORD;
  if (!isAdmin && rows[0].password !== password) {
    return NextResponse.json({ error: "비밀번호가 일치하지 않습니다" }, { status: 403 });
  }

  await sql`DELETE FROM inquiries WHERE id = ${Number(id)}`;
  return NextResponse.json({ success: true });
}
