import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";
import { verifyAdminPassword } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { password, uid } = await request.json().catch(() => ({ password: "", uid: "" }));
  if (!(await verifyAdminPassword(password))) {
    return NextResponse.json({ error: "관리자 비밀번호 불일치" }, { status: 403 });
  }

  // 전체 댓글 샘플 (firebase_uid가 있는 것 중)
  const allComments = await sql`
    SELECT id, post_id, author, firebase_uid,
           LENGTH(content) as content_len,
           LEFT(content, 80) as content_preview,
           created_at
    FROM comments
    WHERE firebase_uid IS NOT NULL AND firebase_uid != ''
    ORDER BY created_at DESC LIMIT 20
  `;

  // 특정 uid의 댓글
  let userComments = [] as any[];
  if (uid) {
    userComments = await sql`
      SELECT id, post_id, author,
             LENGTH(content) as content_len,
             LEFT(content, 200) as content_preview,
             created_at
      FROM comments
      WHERE firebase_uid = ${uid}
      ORDER BY created_at DESC LIMIT 20
    `;
  }

  return NextResponse.json({ allComments, userComments });
}
