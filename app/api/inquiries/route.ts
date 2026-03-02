import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await sql`
    SELECT id, author, title, reply, replied_at, hidden, created_at
    FROM inquiries
    WHERE hidden = false OR hidden IS NULL
    ORDER BY created_at DESC
  `;
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { author, password, email, title, content } = body;

  if (!author?.trim() || !password?.trim() || !email?.trim() || !title?.trim() || !content?.trim()) {
    return NextResponse.json({ error: "모든 항목을 입력해주세요" }, { status: 400 });
  }

  await sql`ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS email TEXT DEFAULT ''`;
  await sql`INSERT INTO inquiries (author, password, email, title, content)
    VALUES (${author.trim()}, ${password.trim()}, ${email.trim()}, ${title.trim()}, ${content.trim()})`;
  return NextResponse.json({ success: true });
}
