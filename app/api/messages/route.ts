export const dynamic = "force-dynamic";

import { sql } from "@/app/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { sanitize, validateLength } from "@/app/lib/security";

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      sender_uid TEXT NOT NULL,
      receiver_uid TEXT NOT NULL,
      sender_nickname VARCHAR(50) NOT NULL,
      receiver_nickname VARCHAR(50) NOT NULL,
      content TEXT NOT NULL,
      parent_id INTEGER,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;
  try { await sql`CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_uid, created_at DESC)`; } catch {}
  try { await sql`CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_uid, created_at DESC)`; } catch {}
}

// GET /api/messages?type=received|sent
export async function GET(req: NextRequest) {
  const user = await verifyAuth(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  await ensureTable();

  const type = req.nextUrl.searchParams.get("type") || "received";

  if (type === "received") {
    const messages = await sql`
      SELECT * FROM messages WHERE receiver_uid = ${user.uid}
      ORDER BY created_at DESC LIMIT 50
    `;
    const unread = await sql`
      SELECT COUNT(*) as count FROM messages WHERE receiver_uid = ${user.uid} AND is_read = false
    `;
    return NextResponse.json({ messages, unreadCount: Number(unread[0].count) });
  }

  const messages = await sql`
    SELECT * FROM messages WHERE sender_uid = ${user.uid}
    ORDER BY created_at DESC LIMIT 50
  `;
  return NextResponse.json({ messages });
}

// POST /api/messages — 쪽지 보내기
export async function POST(req: NextRequest) {
  const user = await verifyAuth(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  await ensureTable();

  const body = await req.json();
  const receiverNickname = (body.receiver_nickname || "").trim();
  const rawContent = (body.content || "").trim();
  const parentId = body.parent_id || null;

  if (!receiverNickname) return NextResponse.json({ error: "받는 사람을 입력해주세요" }, { status: 400 });
  if (!rawContent) return NextResponse.json({ error: "내용을 입력해주세요" }, { status: 400 });
  if (rawContent.length > 1000) return NextResponse.json({ error: "쪽지는 1000자까지 입력 가능합니다" }, { status: 400 });

  // 받는 사람 닉네임 → uid 조회
  const receiver = await sql`SELECT firebase_uid FROM nicknames WHERE name = ${receiverNickname} LIMIT 1`;
  if (receiver.length === 0) return NextResponse.json({ error: "존재하지 않는 닉네임입니다" }, { status: 404 });
  const receiverUid = receiver[0].firebase_uid;

  if (receiverUid === user.uid) return NextResponse.json({ error: "자기 자신에게는 보낼 수 없습니다" }, { status: 400 });

  // 보내는 사람 닉네임 조회
  const sender = await sql`SELECT name FROM nicknames WHERE firebase_uid = ${user.uid} LIMIT 1`;
  const senderNickname = sender.length > 0 ? sender[0].name : "알 수 없음";

  const content = sanitize(validateLength(rawContent, 1000));

  await sql`
    INSERT INTO messages (sender_uid, receiver_uid, sender_nickname, receiver_nickname, content, parent_id)
    VALUES (${user.uid}, ${receiverUid}, ${senderNickname}, ${receiverNickname}, ${content}, ${parentId})
  `;

  return NextResponse.json({ success: true });
}
