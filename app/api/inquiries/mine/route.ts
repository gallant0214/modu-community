import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

// GET /api/inquiries/mine — 로그인한 사용자 본인의 문의만 반환
export async function GET(request: Request) {
  const user = await verifyAuth(request);
  if (!user) {
    return NextResponse.json({ error: "로그인을 해주세요" }, { status: 401 });
  }

  try {
    // email·firebase_uid 컬럼이 없으면 추가 (기존 스키마 호환)
    await sql`ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS email TEXT DEFAULT ''`;
    await sql`ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS firebase_uid TEXT`;

    const email = user.email ?? "";
    const rows = await sql`
      SELECT id, author, title, content, reply, replied_at, hidden, created_at, email
      FROM inquiries
      WHERE firebase_uid = ${user.uid}
         OR (${email} <> '' AND email = ${email})
      ORDER BY created_at DESC
    `;

    return NextResponse.json(rows);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "조회 실패" }, { status: 500 });
  }
}
