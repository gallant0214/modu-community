import { supabase } from "@/app/lib/supabase";
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

  const { data, error: fetchErr } = await supabase
    .from("posts")
    .select("id")
    .eq("id", Number(id))
    .eq("is_notice", true)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "공지를 찾을 수 없습니다" }, { status: 404 });

  const { error } = await supabase
    .from("posts")
    .update({
      title: sanitize(validateLength(title.trim(), 200)),
      content: sanitize(validateLength(content.trim(), 50000)),
      updated_at: new Date().toISOString(),
    })
    .eq("id", Number(id));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
