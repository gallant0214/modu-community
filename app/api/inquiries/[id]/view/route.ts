import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { password } = body;

  const { data: row, error } = await supabase
    .from("inquiries")
    .select("id, author, title, content, reply, replied_at, password, created_at")
    .eq("id", Number(id))
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "문의를 찾을 수 없습니다" }, { status: 404 });

  const isAdmin = password === process.env.ADMIN_PASSWORD;
  if (!isAdmin && row.password !== password) {
    return NextResponse.json({ error: "비밀번호가 일치하지 않습니다" }, { status: 403 });
  }

  // 관리자가 조회 시 읽음 처리 (아직 읽지 않은 것만)
  if (isAdmin) {
    await supabase
      .from("inquiries")
      .update({ read_at: new Date().toISOString() })
      .eq("id", Number(id))
      .is("read_at", null);
  }

  return NextResponse.json({
    id: row.id,
    author: row.author,
    title: row.title,
    content: row.content,
    reply: row.reply,
    replied_at: row.replied_at,
    created_at: row.created_at,
    isAdmin,
  });
}
