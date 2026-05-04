export const dynamic = "force-dynamic";

import { supabase } from "@/app/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

// POST /api/messages/[id]/spam — 받은쪽지를 스팸으로 신고 (스팸쪽지함으로 이동)
// DELETE — 스팸 해제 (받은쪽지함으로 복귀)
async function setSpam(req: NextRequest, params: Promise<{ id: string }>, spam: boolean) {
  const user = await verifyAuth(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const { id } = await params;
  const msgId = Number(id);

  const { data: msg } = await supabase
    .from("messages")
    .select("receiver_uid")
    .eq("id", msgId)
    .maybeSingle();
  if (!msg) return NextResponse.json({ error: "쪽지를 찾을 수 없습니다" }, { status: 404 });

  // 받은 쪽지에서만 스팸 신고 가능
  if (msg.receiver_uid !== user.uid) {
    return NextResponse.json({ error: "받은 쪽지에서만 스팸 신고 가능합니다" }, { status: 403 });
  }

  const update = {
    spam_reported_by_receiver: spam,
    spam_reported_at: spam ? new Date().toISOString() : null,
  };
  const { error } = await supabase.from("messages").update(update).eq("id", msgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return setSpam(req, params, true);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return setSpam(req, params, false);
}
