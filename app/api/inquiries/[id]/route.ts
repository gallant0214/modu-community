import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { sanitize, validateLength } from "@/app/lib/security";
import { verifyAdminPassword } from "@/app/lib/admin-auth";
import { verifyAuth } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

async function verifyOwnerOrAdmin(
  id: number,
  user: { uid: string; email?: string } | null,
  password: string | undefined,
): Promise<{ ok: true; isAdmin: boolean } | { ok: false; status: number; error: string }> {
  const { data: row, error } = await supabase
    .from("inquiries")
    .select("password, firebase_uid, email")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message };
  if (!row) return { ok: false, status: 404, error: "문의를 찾을 수 없습니다" };

  if (password && (await verifyAdminPassword(password))) {
    return { ok: true, isAdmin: true };
  }

  if (user) {
    const uidMatch = row.firebase_uid && row.firebase_uid === user.uid;
    const emailMatch = row.email && user.email && row.email === user.email;
    if (uidMatch || emailMatch) return { ok: true, isAdmin: false };
  }

  if (password && row.password === password) {
    return { ok: true, isAdmin: false };
  }

  return { ok: false, status: 403, error: "권한이 없습니다" };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyAuth(request);
  const { id } = await params;

  const check = await verifyOwnerOrAdmin(Number(id), user, undefined);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  const { data, error } = await supabase
    .from("inquiries")
    .select("id, author, email, title, content, reply, replied_at, hidden, created_at")
    .eq("id", Number(id))
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "문의를 찾을 수 없습니다" }, { status: 404 });

  return NextResponse.json(data);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyAuth(request);
  const { id } = await params;
  const body = await request.json();
  const { password, title, content } = body;

  const check = await verifyOwnerOrAdmin(Number(id), user, password);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  if (!title?.trim() || !content?.trim()) {
    return NextResponse.json({ error: "제목과 내용을 입력해주세요" }, { status: 400 });
  }

  const { error } = await supabase
    .from("inquiries")
    .update({
      title: sanitize(validateLength(title.trim(), 200)),
      content: sanitize(validateLength(content.trim(), 5000)),
    })
    .eq("id", Number(id));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyAuth(request);
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { password } = body as { password?: string };

  const check = await verifyOwnerOrAdmin(Number(id), user, password);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  const { error } = await supabase.from("inquiries").delete().eq("id", Number(id));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
