export const dynamic = "force-dynamic";

import { sql } from "@/app/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { sanitize, validateLength } from "@/app/lib/security";

const THREE_WEEKS_MS = 21 * 24 * 60 * 60 * 1000;

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS nicknames (
      id SERIAL PRIMARY KEY,
      name VARCHAR(50) UNIQUE NOT NULL,
      firebase_uid TEXT,
      changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE nicknames ADD COLUMN IF NOT EXISTS firebase_uid TEXT`;
  await sql`ALTER TABLE nicknames ADD COLUMN IF NOT EXISTS changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`;
  try {
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_nicknames_uid ON nicknames (firebase_uid) WHERE firebase_uid IS NOT NULL`;
  } catch {}
}

// GET /api/nicknames?uid=xxx  — 닉네임 + 변경가능 여부 조회
// GET /api/nicknames?name=xxx — 중복 확인
export async function GET(req: NextRequest) {
  const uid = req.nextUrl.searchParams.get("uid")?.trim();
  const name = req.nextUrl.searchParams.get("name")?.trim();

  await ensureTable();

  if (uid) {
    const rows = await sql`SELECT name, changed_at FROM nicknames WHERE firebase_uid = ${uid} LIMIT 1`;
    if (rows.length > 0) {
      const changedAt = rows[0].changed_at ? new Date(rows[0].changed_at).getTime() : 0;
      const canChange = changedAt === 0 || (Date.now() - changedAt >= THREE_WEEKS_MS);
      const remainingDays = canChange ? 0 : Math.ceil((THREE_WEEKS_MS - (Date.now() - changedAt)) / (24 * 60 * 60 * 1000));
      return NextResponse.json({ nickname: rows[0].name, canChange, remainingDays });
    }
    return NextResponse.json({ nickname: null, canChange: true, remainingDays: 0 });
  }

  if (name) {
    const rows = await sql`SELECT id FROM nicknames WHERE name = ${name} LIMIT 1`;
    return NextResponse.json({ available: rows.length === 0 });
  }

  return NextResponse.json({ error: "uid or name required" }, { status: 400 });
}

// POST /api/nicknames — 닉네임 등록/변경 (Firebase 인증 필수)
export async function POST(req: NextRequest) {
  const user = await verifyAuth(req);
  if (!user) {
    return NextResponse.json({ success: false, error: "로그인이 필요합니다" }, { status: 401 });
  }

  const body = await req.json();
  const rawName = (body.nickname || body.name || "").trim();
  const isFirstSetup = body.firstSetup === true;

  if (!rawName) {
    return NextResponse.json({ success: false, error: "닉네임을 입력해주세요" }, { status: 400 });
  }

  if (rawName.length < 2) {
    return NextResponse.json({ success: false, error: "닉네임은 2글자 이상이어야 합니다" }, { status: 400 });
  }

  if (rawName.length > 8) {
    return NextResponse.json({ success: false, error: "닉네임은 8글자 이하여야 합니다" }, { status: 400 });
  }

  const name = sanitize(validateLength(rawName, 50));

  await ensureTable();

  // 기존 닉네임 확인
  const current = await sql`SELECT name, changed_at FROM nicknames WHERE firebase_uid = ${user.uid} LIMIT 1`;

  // 3주 제한 체크 (첫 설정이 아닌 경우만)
  if (!isFirstSetup && current.length > 0 && current[0].changed_at) {
    const changedAt = new Date(current[0].changed_at).getTime();
    if (Date.now() - changedAt < THREE_WEEKS_MS) {
      const remainingDays = Math.ceil((THREE_WEEKS_MS - (Date.now() - changedAt)) / (24 * 60 * 60 * 1000));
      return NextResponse.json({
        success: false,
        error: `닉네임 변경은 ${remainingDays}일 후에 가능합니다`
      }, { status: 429 });
    }
  }

  // 같은 닉네임이면 변경 불필요
  if (current.length > 0 && current[0].name === name) {
    return NextResponse.json({ success: true, nickname: name });
  }

  // 중복 확인 (다른 유저가 사용 중인지)
  const existing = await sql`SELECT firebase_uid FROM nicknames WHERE name = ${name} LIMIT 1`;
  if (existing.length > 0 && existing[0].firebase_uid && existing[0].firebase_uid !== user.uid) {
    return NextResponse.json({ success: false, error: "이미 사용 중인 닉네임입니다" }, { status: 409 });
  }

  // 기존 닉네임 삭제
  await sql`DELETE FROM nicknames WHERE firebase_uid = ${user.uid}`;
  await sql`DELETE FROM nicknames WHERE name = ${name}`;

  // 새 닉네임 등록
  await sql`INSERT INTO nicknames (name, firebase_uid, changed_at) VALUES (${name}, ${user.uid}, NOW())`;

  return NextResponse.json({ success: true, nickname: name });
}
