import { NextResponse } from "next/server";
import { sql } from "@/app/lib/db";
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

  // 테이블 생성 (없으면)
  await sql`
    CREATE TABLE IF NOT EXISTS admin_emails (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  const rows = await sql`SELECT id, email, created_at FROM admin_emails ORDER BY created_at ASC`;
  return NextResponse.json({ emails: rows });
}

/**
 * POST /api/admin/admins
 * Body: { password, email }
 * 관리자 이메일 추가
 */
export async function POST(request: Request) {
  const { password, email } = await request.json();

  if (!(await verifyAdminPassword(password))) {
    return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
  }

  if (!email?.trim() || !email.includes("@")) {
    return NextResponse.json({ error: "올바른 이메일을 입력해주세요" }, { status: 400 });
  }

  await sql`
    CREATE TABLE IF NOT EXISTS admin_emails (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  try {
    await sql`INSERT INTO admin_emails (email) VALUES (${email.trim().toLowerCase()})`;
  } catch {
    return NextResponse.json({ error: "이미 등록된 이메일입니다" }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/admin/admins
 * Body: { password, email }
 * 관리자 이메일 삭제
 */
export async function DELETE(request: Request) {
  const { password, email } = await request.json();

  if (!(await verifyAdminPassword(password))) {
    return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
  }

  await sql`DELETE FROM admin_emails WHERE email = ${email.trim().toLowerCase()}`;
  return NextResponse.json({ success: true });
}
