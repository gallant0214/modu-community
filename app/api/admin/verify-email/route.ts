import { NextResponse } from "next/server";
import { sql } from "@/app/lib/db";
import { verifyAuth } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/verify-email
 * Firebase ID Token으로 관리자 이메일 확인
 * 등록된 관리자 이메일이면 접근 허용
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

    // 등록된 관리자 이메일이 하나도 없으면 모든 Google 로그인 허용 (초기 설정용)
    const countRows = await sql`SELECT COUNT(*) as cnt FROM admin_emails`;
    const totalCount = Number(countRows[0]?.cnt || 0);

    if (totalCount === 0) {
      return NextResponse.json({ success: true, email: user.email });
    }

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
