import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { verifyAdminPassword } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/admins?password=xxx
 * 등록된 관리자 이메일 목록 조회
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const password = searchParams.get("password") || "";

  if (!(await verifyAdminPassword(password))) {
    return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("admin_emails")
    .select("id, email, created_at")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ emails: data });
}

/**
 * POST /api/admin/admins  Body: { password, email }
 */
export async function POST(request: Request) {
  const { password, email } = await request.json();

  if (!(await verifyAdminPassword(password))) {
    return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
  }

  if (!email?.trim() || !email.includes("@")) {
    return NextResponse.json({ error: "올바른 이메일을 입력해주세요" }, { status: 400 });
  }

  const { error } = await supabase
    .from("admin_emails")
    .insert({ email: email.trim().toLowerCase() });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "이미 등록된 이메일입니다" }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/admin/admins  Body: { password, email }
 */
export async function DELETE(request: Request) {
  const { password, email } = await request.json();

  if (!(await verifyAdminPassword(password))) {
    return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
  }

  const { error } = await supabase
    .from("admin_emails")
    .delete()
    .eq("email", email.trim().toLowerCase());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
