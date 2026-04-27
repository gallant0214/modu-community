import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import { sanitize, validateLength } from "@/app/lib/security";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { password, reply } = body;

  const authError = await verifyAdmin(request, password);
  if (authError) return authError;

  if (!reply?.trim()) {
    return NextResponse.json({ error: "답글 내용을 입력해주세요" }, { status: 400 });
  }

  const { error } = await supabase
    .from("inquiries")
    .update({
      reply: sanitize(validateLength(reply.trim(), 5000)),
      replied_at: new Date().toISOString(),
    })
    .eq("id", Number(id));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
