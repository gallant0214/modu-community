import { NextResponse } from "next/server";
import { verifyAuth, isAdminUid } from "@/app/lib/firebase-admin";
import { sql } from "@/app/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await verifyAuth(request);
  if (!user) {
    return NextResponse.json({ isAdmin: false });
  }

  // 1. 환경변수 ADMIN_UIDS 확인
  if (isAdminUid(user.uid)) {
    return NextResponse.json({ isAdmin: true });
  }

  // 2. DB admin_emails 테이블 확인
  if (user.email) {
    try {
      const rows = await sql`
        SELECT id FROM admin_emails WHERE email = ${user.email.toLowerCase()} LIMIT 1
      `;
      if (rows.length > 0) {
        return NextResponse.json({ isAdmin: true });
      }
    } catch {
      // 테이블이 없는 경우 무시
    }
  }

  return NextResponse.json({ isAdmin: false });
}
