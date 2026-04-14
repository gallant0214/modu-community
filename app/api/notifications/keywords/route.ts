import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

// GET /api/notifications/keywords — 내 키워드 목록
export async function GET(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  await sql`CREATE TABLE IF NOT EXISTS user_keywords (
    id SERIAL PRIMARY KEY,
    firebase_uid TEXT NOT NULL,
    keyword TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(firebase_uid, keyword)
  )`;

  const rows = await sql`
    SELECT id, keyword, created_at FROM user_keywords
    WHERE firebase_uid = ${user.uid}
    ORDER BY created_at DESC
  `;
  return NextResponse.json({ keywords: rows });
}

// POST /api/notifications/keywords — 키워드 전체 동기화 (웹·앱 공용)
// body: { keywords: ["대구", "수성구"] }
export async function POST(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const keywords: string[] = Array.isArray(body.keywords) ? body.keywords : [];
  const cleaned = keywords
    .map((k) => String(k || "").trim())
    .filter(Boolean)
    .slice(0, 20); // 최대 20개

  await sql`CREATE TABLE IF NOT EXISTS user_keywords (
    id SERIAL PRIMARY KEY,
    firebase_uid TEXT NOT NULL,
    keyword TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(firebase_uid, keyword)
  )`;

  // 전체 교체: 기존 삭제 후 insert
  await sql`DELETE FROM user_keywords WHERE firebase_uid = ${user.uid}`;
  for (const k of cleaned) {
    try {
      await sql`INSERT INTO user_keywords (firebase_uid, keyword) VALUES (${user.uid}, ${k})`;
    } catch {}
  }

  return NextResponse.json({ success: true, count: cleaned.length });
}

// DELETE /api/notifications/keywords?keyword=xxx
export async function DELETE(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const url = new URL(request.url);
  const keyword = url.searchParams.get("keyword");
  if (!keyword) return NextResponse.json({ error: "keyword required" }, { status: 400 });

  await sql`DELETE FROM user_keywords WHERE firebase_uid = ${user.uid} AND keyword = ${keyword}`;
  return NextResponse.json({ success: true });
}
