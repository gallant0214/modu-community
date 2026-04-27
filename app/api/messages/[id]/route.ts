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
