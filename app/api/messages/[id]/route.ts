export const dynamic = "force-dynamic";

import { sql } from "@/app/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

// GET /api/messages/[id] — 쪽지 상세 (원본 + 답장 스레드)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await verifyAuth(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { id } = await params;
  const msgId = Number(id);

  const rows = await sql`SELECT * FROM messages WHERE id = ${msgId} LIMIT 1`;
  if (rows.length === 0) return NextResponse.json({ error: "쪽지를 찾을 수 없습니다" }, { status: 404 });

  const msg = rows[0];
  if (msg.sender_uid !== user.uid && msg.receiver_uid !== user.uid) {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  // 원본 메시지 찾기
  const originalId = msg.parent_id || msg.id;
  const original = msg.parent_id
    ? (await sql`SELECT * FROM messages WHERE id = ${originalId} LIMIT 1`)[0] || msg
    : msg;

  // 답장 목록
  const replies = await sql`
    SELECT * FROM messages WHERE parent_id = ${originalId} ORDER BY created_at ASC
  `;

  return NextResponse.json({ original, replies });
}
