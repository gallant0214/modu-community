export const dynamic = "force-dynamic";

import { supabase } from "@/app/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { sanitize, validateLength } from "@/app/lib/security";
import { sendPushToUser } from "@/app/lib/notifications";

// GET /api/messages?type=received|sent
export async function GET(req: NextRequest) {
  const user = await verifyAuth(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const type = req.nextUrl.searchParams.get("type") || "received";

  if (type === "received") {
    const [msgRes, unreadRes] = await Promise.all([
      supabase
        .from("messages")
        .select("*")
        .eq("receiver_uid", user.uid)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("receiver_uid", user.uid)
        .eq("is_read", false),
    ]);
    if (msgRes.error) return NextResponse.json({ error: msgRes.error.message }, { status: 500 });
    return NextResponse.json({
      messages: msgRes.data,
      unreadCount: unreadRes.count ?? 0,
    });
  }

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("sender_uid", user.uid)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data });
}

// POST /api/messages — 쪽지 보내기
export async function POST(req: NextRequest) {
  const user = await verifyAuth(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const body = await req.json();
  const receiverNickname = (body.receiver_nickname || "").trim();
  const rawContent = (body.content || "").trim();
  const parentId = body.parent_id || null;

  if (!receiverNickname) return NextResponse.json({ error: "받는 사람을 입력해주세요" }, { status: 400 });
  if (!rawContent) return NextResponse.json({ error: "내용을 입력해주세요" }, { status: 400 });
  if (rawContent.length > 1000) return NextResponse.json({ error: "쪽지는 1000자까지 입력 가능합니다" }, { status: 400 });

  const { data: receiver } = await supabase
    .from("nicknames")
    .select("firebase_uid")
    .eq("name", receiverNickname)
    .maybeSingle();
  if (!receiver) return NextResponse.json({ error: "존재하지 않는 닉네임입니다" }, { status: 404 });
  const receiverUid = receiver.firebase_uid;
  if (!receiverUid) return NextResponse.json({ error: "존재하지 않는 닉네임입니다" }, { status: 404 });

  if (receiverUid === user.uid) {
    return NextResponse.json({ error: "자기 자신에게는 보낼 수 없습니다" }, { status: 400 });
  }

  // 양방향 차단 체크 — 어느 한쪽이라도 차단했으면 발송 불가
  const { data: blockRow } = await supabase
    .from("user_blocks")
    .select("id")
    .or(
      `and(blocker_uid.eq.${user.uid},blocked_uid.eq.${receiverUid}),` +
      `and(blocker_uid.eq.${receiverUid},blocked_uid.eq.${user.uid})`,
    )
    .limit(1)
    .maybeSingle();
  if (blockRow) {
    return NextResponse.json({ error: "차단된 사용자에게는 쪽지를 보낼 수 없습니다" }, { status: 403 });
  }

  const { data: sender } = await supabase
    .from("nicknames")
    .select("name")
    .eq("firebase_uid", user.uid)
    .maybeSingle();
  const senderNickname = sender?.name || "알 수 없음";

  const content = sanitize(validateLength(rawContent, 1000));

  const { data: inserted, error } = await supabase.from("messages").insert({
    sender_uid: user.uid,
    receiver_uid: receiverUid,
    sender_nickname: senderNickname,
    receiver_nickname: receiverNickname,
    content,
    parent_id: parentId,
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 받는 사람에게 푸시 알림 (notify_message OFF 면 sendPushToUser 내부에서 스킵)
  const preview = content.length > 60 ? content.slice(0, 60) + "…" : content;
  sendPushToUser(
    receiverUid,
    "message",
    `${senderNickname} 님이 쪽지를 보냈어요`,
    preview,
    { messageId: String(inserted?.id || ""), senderNickname },
  ).catch(() => {});

  return NextResponse.json({ success: true });
}
