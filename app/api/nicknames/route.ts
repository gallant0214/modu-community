export const dynamic = "force-dynamic";

import { sql } from "@/app/lib/db";
import { NextRequest, NextResponse } from "next/server";

// 닉네임 테이블 자동 생성
async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS nicknames (
      id SERIAL PRIMARY KEY,
      name VARCHAR(50) UNIQUE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;
}

// GET /api/nicknames?name=닉네임 — 중복 확인
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name")?.trim();
  if (!name) {
    return NextResponse.json({ available: false, error: "name required" });
  }

  await ensureTable();

  const rows = await sql`SELECT id FROM nicknames WHERE name = ${name} LIMIT 1`;
  return NextResponse.json({ available: rows.length === 0 });
}

// POST /api/nicknames — 닉네임 등록
export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = (body.name || "").trim();
  const oldName = (body.oldName || "").trim();

  if (!name) {
    return NextResponse.json({ success: false, error: "name required" }, { status: 400 });
  }

  await ensureTable();

  // 기존 닉네임 변경인 경우 이전 닉네임 삭제
  if (oldName) {
    await sql`DELETE FROM nicknames WHERE name = ${oldName}`;
  }

  try {
    await sql`INSERT INTO nicknames (name) VALUES (${name}) ON CONFLICT (name) DO NOTHING`;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "duplicate" }, { status: 409 });
  }
}
