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

  const rows = await sql`SELECT id, author, title, content, reply, replied_at, password, created_at FROM inquiries WHERE id = ${Number(id)}`;
  if (rows.length === 0) {
    return NextResponse.json({ error: "문의를 찾을 수 없습니다" }, { status: 404 });
  }

  const isAdmin = password === process.env.ADMIN_PASSWORD;
  if (!isAdmin && rows[0].password !== password) {
    return NextResponse.json({ error: "비밀번호가 일치하지 않습니다" }, { status: 403 });
  }

  return NextResponse.json({
    content: rows[0].content,
    reply: rows[0].reply,
    replied_at: rows[0].replied_at,
    isAdmin,
  });
}
