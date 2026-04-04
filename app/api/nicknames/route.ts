export const dynamic = "force-dynamic";

import { sql } from "@/app/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { sanitize, validateLength } from "@/app/lib/security";

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

// POST /api/nicknames — 닉네임 등록 (Firebase 인증 필수)
export async function POST(req: NextRequest) {
  // Firebase 인증 확인
  const user = await verifyAuth(req);
  if (!user) {
    return NextResponse.json({ success: false, error: "로그인이 필요합니다" }, { status: 401 });
  }

  const body = await req.json();
  const rawName = (body.name || "").trim();
  const oldName = (body.oldName || "").trim();

  if (!rawName) {
    return NextResponse.json({ success: false, error: "name required" }, { status: 400 });
  }

  const name = sanitize(validateLength(rawName, 50));

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
