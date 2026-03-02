import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const { postId } = await params;
  const body = await request.json();
  const { password } = body;

  const rows = await sql`SELECT password FROM posts WHERE id = ${Number(postId)}`;
  if (rows.length === 0) {
    return NextResponse.json({ error: "게시글을 찾을 수 없습니다" }, { status: 404 });
  }

  const isAdmin = password === process.env.ADMIN_PASSWORD;
  if (!isAdmin && rows[0].password !== password) {
    return NextResponse.json({ error: "비밀번호가 일치하지 않습니다" }, { status: 403 });
  }
  return NextResponse.json({ success: true });
}
