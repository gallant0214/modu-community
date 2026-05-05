export const dynamic = "force-dynamic";

import { supabase } from "@/app/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

// POST /api/messages/[id]/read — 읽음 처리
// 쪽지 자체 is_read=true + 알림 리스트 항목(notification_logs)의 read=true 까지 동기 처리.
// 사용자가 쪽지를 읽으면 알림함의 빨간색 N 도 자동으로 사라지도록.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await verifyAuth(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { id } = await params;
  const msgId = Number(id);

  const { error } = await supabase
    .from("messages")
    .update({ is_read: true })
    .eq("id", msgId)
    .eq("receiver_uid", user.uid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 알림 로그도 동기 read 처리. data 컬럼이 text(JSON 문자열) 라 LIKE 매칭.
  // type=message + 본인 uid + 그 messageId 가 data 안에 들어있는 unread 항목.
  await supabase
    .from("notification_logs")
    .update({ read: true })
    .eq("firebase_uid", user.uid)
    .eq("type", "message")
    .eq("read", false)
    .like("data", `%"messageId":"${msgId}"%`);

  return NextResponse.json({ success: true });
}
