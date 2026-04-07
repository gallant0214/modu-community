import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";
import { sanitize, checkRateLimit, getClientIp, validateLength } from "@/app/lib/security";
import { verifyAuth } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const author = searchParams.get("author");
  const password = searchParams.get("password");

  await sql`ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS firebase_uid TEXT`;

  if (author && password) {
    const rows = await sql`
      SELECT id, author, title, reply, replied_at, hidden, created_at, firebase_uid
      FROM inquiries
      WHERE author = ${author} AND password = ${password}
      ORDER BY created_at DESC
    `;
    return NextResponse.json(rows);
  }

  const rows = await sql`
    SELECT id, author, title, reply, replied_at, hidden, created_at, firebase_uid
    FROM inquiries
    WHERE hidden = false OR hidden IS NULL
    ORDER BY created_at DESC
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

  await sql`ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS email TEXT DEFAULT ''`;
  await sql`ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS firebase_uid TEXT`;
  await sql`INSERT INTO inquiries (author, password, email, title, content, firebase_uid)
    VALUES (${sanitize(validateLength(author.trim(), 50))}, ${(password || user.uid).trim()}, ${sanitize(validateLength((email || "").trim(), 100))}, ${sanitize(validateLength(title.trim(), 200))}, ${sanitize(validateLength(content.trim(), 10000))}, ${user.uid})`;
  return NextResponse.json({ success: true });
}
