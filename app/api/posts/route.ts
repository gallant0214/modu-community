import { sql } from "@/app/lib/db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json();
  const { category_id, title, content, author, password, region, tags } = body;

  if (!title?.trim() || !content?.trim() || !author?.trim() || !password?.trim()) {
    return NextResponse.json({ error: "필수 항목을 입력해주세요" }, { status: 400 });
  }

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";

  await sql`INSERT INTO posts (category_id, title, content, author, password, region, tags, ip_address)
    VALUES (${Number(category_id)}, ${title.trim()}, ${content.trim()}, ${author.trim()}, ${password.trim()}, ${(region || "전국").trim()}, ${(tags || "").trim()}, ${ip})`;

  return NextResponse.json({ success: true });
}
