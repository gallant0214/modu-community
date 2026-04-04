export const dynamic = "force-dynamic";

import { sql } from "@/app/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { sanitize, validateLength } from "@/app/lib/security";

// 닉네임 테이블 자동 생성 (firebase_uid 포함)
async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS nicknames (
      id SERIAL PRIMARY KEY,
      name VARCHAR(50) UNIQUE NOT NULL,
      firebase_uid TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;
  // firebase_uid 컬럼이 없으면 추가
  await sql`ALTER TABLE nicknames ADD COLUMN IF NOT EXISTS firebase_uid TEXT`;
  // firebase_uid 유니크 인덱스 (한 유저 = 한 닉네임)
  try {
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_nicknames_uid ON nicknames (firebase_uid) WHERE firebase_uid IS NOT NULL`;
  } catch { /* 이미 존재 */ }
}

// GET /api/nicknames?uid=xxx  — 해당 유저의 닉네임 조회
// GET /api/nicknames?name=xxx — 중복 확인
export async function GET(req: NextRequest) {
  const uid = req.nextUrl.searchParams.get("uid")?.trim();
  const name = req.nextUrl.searchParams.get("name")?.trim();

  await ensureTable();

  // UID로 조회 (유저의 닉네임 가져오기)
  if (uid) {
    const rows = await sql`SELECT name FROM nicknames WHERE firebase_uid = ${uid} LIMIT 1`;
    if (rows.length > 0) {
      return NextResponse.json({ nickname: rows[0].name });
    }
    return NextResponse.json({ nickname: null });
  }

  // 이름 중복 확인
  if (name) {
    const rows = await sql`SELECT id FROM nicknames WHERE name = ${name} LIMIT 1`;
    return NextResponse.json({ available: rows.length === 0 });
  }

  return NextResponse.json({ error: "uid or name required" }, { status: 400 });
}

// POST /api/nicknames — 닉네임 등록/변경 (Firebase 인증 필수)
// body: { nickname: "새닉네임" } 또는 { name: "새닉네임" }
export async function POST(req: NextRequest) {
  const user = await verifyAuth(req);
  if (!user) {
    return NextResponse.json({ success: false, error: "로그인이 필요합니다" }, { status: 401 });
  }

  const body = await req.json();
  const rawName = (body.nickname || body.name || "").trim();
  const oldName = (body.oldName || "").trim();

  if (!rawName) {
    return NextResponse.json({ success: false, error: "닉네임을 입력해주세요" }, { status: 400 });
  }

  if (rawName.length < 2) {
    return NextResponse.json({ success: false, error: "닉네임은 2글자 이상이어야 합니다" }, { status: 400 });
  }

  const name = sanitize(validateLength(rawName, 50));

  await ensureTable();

  // 이미 이 유저가 가진 닉네임이 있으면 삭제
  await sql`DELETE FROM nicknames WHERE firebase_uid = ${user.uid}`;

  // 기존 이름 기반 삭제 (oldName이 있으면)
  if (oldName) {
    await sql`DELETE FROM nicknames WHERE name = ${oldName} AND (firebase_uid IS NULL OR firebase_uid = ${user.uid})`;
  }

  // 새 닉네임 등록 (중복이면 해당 닉네임이 다른 유저 것인지 확인)
  const existing = await sql`SELECT firebase_uid FROM nicknames WHERE name = ${name} LIMIT 1`;
  if (existing.length > 0 && existing[0].firebase_uid && existing[0].firebase_uid !== user.uid) {
    return NextResponse.json({ success: false, error: "이미 사용 중인 닉네임입니다" }, { status: 409 });
  }

  // 기존 동일 이름 레코드 삭제 후 새로 삽입
  await sql`DELETE FROM nicknames WHERE name = ${name}`;
  await sql`INSERT INTO nicknames (name, firebase_uid) VALUES (${name}, ${user.uid})`;

  return NextResponse.json({ success: true, nickname: name });
}
