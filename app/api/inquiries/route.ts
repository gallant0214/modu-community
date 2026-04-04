import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";
import { sanitize, checkRateLimit, getClientIp, validateLength } from "@/app/lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const author = searchParams.get("author");
  const password = searchParams.get("password");

  if (author && password) {
    const rows = await sql`
      SELECT id, author, title, reply, replied_at, hidden, created_at
      FROM inquiries
      WHERE author = ${author} AND password = ${password}
      ORDER BY created_at DESC
    `;
    return NextResponse.json(rows);
  }

  const rows = await sql`
    SELECT id, author, title, reply, replied_at, hidden, created_at
    FROM inquiries
    WHERE hidden = false OR hidden IS NULL
    ORDER BY created_at DESC
  `;
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rateLimitResponse = checkRateLimit(ip, "write");
  if (rateLimitResponse) return rateLimitResponse;

  const body = await request.json();
  const { author, password, email, title, content } = body;

  if (!author?.trim() || !password?.trim() || !email?.trim() || !title?.trim() || !content?.trim()) {
    return NextResponse.json({ error: "모든 항목을 입력해주세요" }, { status: 400 });
  }

  await sql`ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS email TEXT DEFAULT ''`;
  await sql`INSERT INTO inquiries (author, password, email, title, content)
    VALUES (${sanitize(validateLength(author.trim(), 50))}, ${password.trim()}, ${sanitize(validateLength(email.trim(), 100))}, ${sanitize(validateLength(title.trim(), 200))}, ${sanitize(validateLength(content.trim(), 10000))})`;
  return NextResponse.json({ success: true });
}
