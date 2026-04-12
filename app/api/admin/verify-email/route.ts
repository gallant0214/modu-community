import { NextResponse } from "next/server";
import { sql } from "@/app/lib/db";
import { verifyAuth, isAdminUid } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/verify-email
 * Firebase ID Token으로 관리자 이메일 확인
 * 등록된 관리자 이메일이면 접근 허용
 *
 * 보안 강화:
 * - admin_emails 테이블이 비어있어도 누구나 통과되던 부트스트랩 홀을 닫음
 * - 테이블이 비어있으면 ADMIN_UIDS 환경변수에 등록된 UID만 허용
 */
export async function POST(request: Request) {
  const user = await verifyAuth(request);
  if (!user || !user.email) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  try {
    // 테이블이 없으면 생성
    await sql`
      CREATE TABLE IF NOT EXISTS admin_emails (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    // 1순위: 환경변수 ADMIN_UIDS 에 등록된 uid 는 항상 허용 (부트스트랩 경로)
    if (isAdminUid(user.uid)) {
      return NextResponse.json({ success: true, email: user.email });
    }

    // 2순위: admin_emails 테이블 매칭
    const rows = await sql`
      SELECT id FROM admin_emails WHERE email = ${user.email.toLowerCase()} LIMIT 1
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: "관리자로 등록되지 않은 이메일입니다" }, { status: 403 });
    }

    return NextResponse.json({ success: true, email: user.email });
  } catch {
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}
