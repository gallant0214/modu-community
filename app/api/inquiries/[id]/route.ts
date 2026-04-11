import { sql } from "@/app/lib/db";
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
  const rows = await sql`SELECT password, firebase_uid, email FROM inquiries WHERE id = ${id}`;
  if (rows.length === 0) return { ok: false, status: 404, error: "문의를 찾을 수 없습니다" };

  // 관리자 비밀번호 확인
  if (password && (await verifyAdminPassword(password))) {
    return { ok: true, isAdmin: true };
  }

  // 본인(Firebase UID 또는 이메일 일치) 확인
  if (user) {
    const row = rows[0];
    const uidMatch = row.firebase_uid && row.firebase_uid === user.uid;
    const emailMatch = row.email && user.email && row.email === user.email;
    if (uidMatch || emailMatch) return { ok: true, isAdmin: false };
  }

  // 기존 호환: 비밀번호 직접 일치 시 허용
  if (password && rows[0].password === password) {
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

  try {
    await sql`ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS email TEXT DEFAULT ''`;
    await sql`ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS firebase_uid TEXT`;
  } catch {}

  const check = await verifyOwnerOrAdmin(Number(id), user, undefined);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  const rows = await sql`
    SELECT id, author, email, title, content, reply, replied_at, hidden, created_at
    FROM inquiries WHERE id = ${Number(id)}
  `;
  if (rows.length === 0) {
    return NextResponse.json({ error: "문의를 찾을 수 없습니다" }, { status: 404 });
  }
  return NextResponse.json(rows[0]);
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

  const safeTitle = sanitize(validateLength(title.trim(), 200));
  const safeContent = sanitize(validateLength(content.trim(), 5000));
  await sql`UPDATE inquiries SET title = ${safeTitle}, content = ${safeContent} WHERE id = ${Number(id)}`;
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

  await sql`DELETE FROM inquiries WHERE id = ${Number(id)}`;
  return NextResponse.json({ success: true });
}
