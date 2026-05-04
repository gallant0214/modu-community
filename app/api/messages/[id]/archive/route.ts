export const dynamic = "force-dynamic";

import { supabase } from "@/app/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

// POST /api/messages/[id]/archive — 보관 (받은/보낸 모두 가능)
// DELETE 동일 경로 — 보관 해제 (보관함에서 원래 함으로 복귀)
async function setArchive(req: NextRequest, params: Promise<{ id: string }>, archived: boolean) {
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

  const isSender = msg.sender_uid === user.uid;
  const isReceiver = msg.receiver_uid === user.uid;
  if (!isSender && !isReceiver) {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  const now = archived ? new Date().toISOString() : null;
  const update: {
    archived_by_receiver?: boolean;
    archived_by_receiver_at?: string | null;
    archived_by_sender?: boolean;
    archived_by_sender_at?: string | null;
  } = {};
  if (isReceiver) {
    update.archived_by_receiver = archived;
    update.archived_by_receiver_at = now;
  }
  if (isSender) {
    update.archived_by_sender = archived;
    update.archived_by_sender_at = now;
  }
  const { error } = await supabase.from("messages").update(update).eq("id", msgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return setArchive(req, params, true);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return setArchive(req, params, false);
}
