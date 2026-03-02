import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ commentId: string }> }
) {
  const { commentId } = await params;
  const body = await request.json();
  const { password, content } = body;

  if (!content?.trim()) {
    return NextResponse.json({ error: "내용을 입력해주세요" }, { status: 400 });
  }

  const rows = await sql`SELECT password FROM comments WHERE id = ${Number(commentId)}`;
  if (rows.length === 0) {
    return NextResponse.json({ error: "댓글을 찾을 수 없습니다" }, { status: 404 });
  }

  const isAdmin = password === process.env.ADMIN_PASSWORD;
  if (!isAdmin && rows[0].password !== password) {
    return NextResponse.json({ error: "비밀번호가 일치하지 않습니다" }, { status: 403 });
  }

  await sql`UPDATE comments SET content = ${content.trim()} WHERE id = ${Number(commentId)}`;
  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ commentId: string }> }
) {
  const { commentId } = await params;
  const body = await request.json();
  const { password, post_id } = body;

  const rows = await sql`SELECT password FROM comments WHERE id = ${Number(commentId)}`;
  if (rows.length === 0) {
    return NextResponse.json({ error: "댓글을 찾을 수 없습니다" }, { status: 404 });
  }

  const isAdmin = password === process.env.ADMIN_PASSWORD;
  if (!isAdmin && rows[0].password !== password) {
    return NextResponse.json({ error: "비밀번호가 일치하지 않습니다" }, { status: 403 });
  }

  await sql`DELETE FROM comments WHERE id = ${Number(commentId)}`;
  if (post_id) {
    await sql`UPDATE posts SET comments_count = (SELECT COUNT(*) FROM comments WHERE post_id = ${Number(post_id)}) WHERE id = ${Number(post_id)}`;
  }
  return NextResponse.json({ success: true });
}
