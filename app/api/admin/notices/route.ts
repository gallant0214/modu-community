import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import { sanitize, validateLength } from "@/app/lib/security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json();
  const { password, title, content } = body;

  const authError = await verifyAdmin(request, password);
  if (authError) return authError;

  if (!title?.trim() || !content?.trim()) {
    return NextResponse.json({ error: "제목과 내용을 입력해주세요" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("posts")
    .insert({
      category_id: 1,
      title: sanitize(validateLength(title.trim(), 200)),
      content: sanitize(validateLength(content.trim(), 50000)),
      author: "관리자",
      password: password,
      is_notice: true,
      firebase_uid: "",
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, id: data.id });
}
