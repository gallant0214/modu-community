import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import { timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/change-password
 * Body: { password, newPassword }
 *
 * admin_settings 테이블에 비밀번호를 저장.
 * 환경변수 ADMIN_PASSWORD는 초기 비밀번호로만 사용.
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { password, newPassword } = body;

  if (!password || !newPassword) {
    return NextResponse.json({ error: "현재 비밀번호와 새 비밀번호를 입력해주세요" }, { status: 400 });
  }

  if (newPassword.length < 8) {
    return NextResponse.json({ error: "새 비밀번호는 8자 이상이어야 합니다" }, { status: 400 });
  }

  if (newPassword.length > 100) {
    return NextResponse.json({ error: "비밀번호가 너무 깁니다" }, { status: 400 });
  }

  // 현재 비밀번호 확인 (verifyAdmin 사용)
  const authError = await verifyAdmin(request, password);
  if (authError) return authError;

  // admin_settings 테이블 생성 (없으면)
  await sql`
    CREATE TABLE IF NOT EXISTS admin_settings (
      key VARCHAR(100) PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  // 비밀번호 업데이트
  await sql`
    INSERT INTO admin_settings (key, value, updated_at)
    VALUES ('admin_password', ${newPassword}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = ${newPassword}, updated_at = NOW()
  `;

  return NextResponse.json({ success: true, message: "비밀번호가 변경되었습니다" });
}
