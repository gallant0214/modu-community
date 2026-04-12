import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";
import { sanitize, checkRateLimit, getClientIp, validateLength } from "@/app/lib/security";
import { verifyAuth, isAdminUid } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

// GET /api/inquiries — 관리자 전용 전체 목록 조회
// 일반 사용자는 /api/inquiries/mine 을 사용
export async function GET(request: Request) {
  const user = await verifyAuth(request);
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  // 관리자 권한 확인 (uid 또는 admin_emails)
  let isAdmin = isAdminUid(user.uid);
  if (!isAdmin && user.email) {
    try {
      const adminCheck = await sql`SELECT id FROM admin_emails WHERE email = ${user.email.toLowerCase()} LIMIT 1`;
      isAdmin = adminCheck.length > 0;
    } catch {}
  }
  if (!isAdmin) {
    return NextResponse.json({ error: "관리자만 조회할 수 있습니다" }, { status: 403 });
  }

  const rows = await sql`
    SELECT id, author, title, reply, replied_at, hidden, created_at, firebase_uid
    FROM inquiries
    WHERE hidden = false OR hidden IS NULL
    ORDER BY created_at DESC
    LIMIT 200
  `;
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인을 해주세요" }, { status: 401 });

  const ip = getClientIp(request);
  const rateLimitResponse = checkRateLimit(ip, "write");
  if (rateLimitResponse) return rateLimitResponse;

  const body = await request.json();
  const { author, password, email, title, content } = body;

  if (!author?.trim() || !title?.trim() || !content?.trim()) {
    return NextResponse.json({ error: "제목과 내용을 입력해주세요" }, { status: 400 });
  }

  await sql`INSERT INTO inquiries (author, password, email, title, content, firebase_uid)
    VALUES (${sanitize(validateLength(author.trim(), 50))}, ${(password || user.uid).trim()}, ${sanitize(validateLength((email || "").trim(), 100))}, ${sanitize(validateLength(title.trim(), 200))}, ${sanitize(validateLength(content.trim(), 10000))}, ${user.uid})`;
  return NextResponse.json({ success: true });
}
