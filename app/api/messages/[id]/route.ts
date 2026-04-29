export const dynamic = "force-dynamic";

import { supabase } from "@/app/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

// GET /api/messages/[id] — 쪽지 상세 (원본 + 답장 스레드)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await verifyAuth(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { id } = await params;
  const msgId = Number(id);

  const { data: msg, error } = await supabase
    .from("messages")
    .select("*")
    .eq("id", msgId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!msg) return NextResponse.json({ error: "쪽지를 찾을 수 없습니다" }, { status: 404 });

  if (msg.sender_uid !== user.uid && msg.receiver_uid !== user.uid) {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  // 원본 메시지 찾기
  const originalId = msg.parent_id || msg.id;
  let original = msg;
  if (msg.parent_id) {
    const { data: parent } = await supabase
      .from("messages")
      .select("*")
      .eq("id", originalId)
      .maybeSingle();
    if (parent) original = parent;
  }

  // 답장 목록
  const { data: replies } = await supabase
    .from("messages")
    .select("*")
    .eq("parent_id", originalId)
    .order("created_at", { ascending: true });

  return NextResponse.json({ original, replies: replies || [] });
}

// DELETE /api/messages/[id] — soft delete (이용자 시점에서만 숨김. DB 에는 남음)
//   sender 가 삭제 → deleted_by_sender = true
//   receiver 가 삭제 → deleted_by_receiver = true
//   양쪽 다 아니면 403
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await verifyAuth(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { id } = await params;
  const msgId = Number(id);

  const { data: msg } = await supabase
    .from("messages")
    .select("sender_uid, receiver_uid")
    .eq("id", msgId)
    .maybeSingle();
  if (!msg) return NextResponse.json({ error: "쪽지를 찾을 수 없습니다" }, { status: 404 });

  const now = new Date().toISOString();
  const isSender = msg.sender_uid === user.uid;
  const isReceiver = msg.receiver_uid === user.uid;
  if (!isSender && !isReceiver) {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  const update: {
    deleted_by_sender?: boolean;
    deleted_by_sender_at?: string;
    deleted_by_receiver?: boolean;
    deleted_by_receiver_at?: string;
  } = {};
  if (isSender) {
    update.deleted_by_sender = true;
    update.deleted_by_sender_at = now;
  }
  if (isReceiver) {
    update.deleted_by_receiver = true;
    update.deleted_by_receiver_at = now;
  }

  const { error } = await supabase.from("messages").update(update).eq("id", msgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
