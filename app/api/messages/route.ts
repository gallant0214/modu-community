export const dynamic = "force-dynamic";

import { supabase } from "@/app/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { sanitize, validateLength } from "@/app/lib/security";
import { sendPushToUser } from "@/app/lib/notifications";
import { waitUntil } from "@vercel/functions";

// GET /api/messages?type=received|sent|archived|spam
export async function GET(req: NextRequest) {
  const user = await verifyAuth(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const type = req.nextUrl.searchParams.get("type") || "received";

  if (type === "received") {
    // 받은쪽지함 — 보관/스팸 제외
    const [msgRes, unreadRes] = await Promise.all([
      supabase
        .from("messages")
        .select("*")
        .eq("receiver_uid", user.uid)
        .eq("deleted_by_receiver", false)
        .eq("archived_by_receiver", false)
        .eq("spam_reported_by_receiver", false)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("receiver_uid", user.uid)
        .eq("deleted_by_receiver", false)
        .eq("archived_by_receiver", false)
        .eq("spam_reported_by_receiver", false)
        .eq("is_read", false),
    ]);
    if (msgRes.error) return NextResponse.json({ error: msgRes.error.message }, { status: 500 });
    return NextResponse.json({
      messages: msgRes.data,
      unreadCount: unreadRes.count ?? 0,
    });
  }

  if (type === "archived") {
    // 보관쪽지함 — 사용자 입장에서 보관 처리한 것 (받은/보낸 양쪽 모두)
    // .or() + 중첩 and() 를 두 개 단순 쿼리로 분리 (런타임 안정성)
    const [recvRes, sendRes] = await Promise.all([
      supabase
        .from("messages")
        .select("*")
        .eq("receiver_uid", user.uid)
        .eq("archived_by_receiver", true)
        .eq("deleted_by_receiver", false)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("messages")
        .select("*")
        .eq("sender_uid", user.uid)
        .eq("archived_by_sender", true)
        .eq("deleted_by_sender", false)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (recvRes.error) return NextResponse.json({ error: recvRes.error.message }, { status: 500 });
    if (sendRes.error) return NextResponse.json({ error: sendRes.error.message }, { status: 500 });
    const merged = [...(recvRes.data || []), ...(sendRes.data || [])]
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .slice(0, 50);
    return NextResponse.json({ messages: merged });
  }

  if (type === "spam") {
    // 스팸쪽지함 — 받은쪽지에서 스팸으로 신고한 것만
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("receiver_uid", user.uid)
      .eq("deleted_by_receiver", false)
      .eq("spam_reported_by_receiver", true)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ messages: data });
  }

  // 보낸쪽지함 — 보관 제외
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("sender_uid", user.uid)
    .eq("deleted_by_sender", false)
    .eq("archived_by_sender", false)
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
  // title 은 "{닉네임} 님이 쪽지를 보냈어요", body 는 쪽지 본문 미리보기.
  // 알림 리스트(notification_logs)와 푸시 배너 모두 이 형식으로 표시됨.
  const preview = content.length > 200 ? content.slice(0, 200) + "…" : content;
  // waitUntil: 응답 즉시 리턴하면서도 백그라운드 푸시 작업이 함수 종료에 의해 잘리지 않게 보장
  waitUntil(
    sendPushToUser(
      receiverUid,
      "message",
      `${senderNickname} 님이 쪽지를 보냈어요`,
      preview,
      {
        messageId: String(inserted?.id || ""),
        senderNickname,
      },
    ).catch(() => {}),
  );

  return NextResponse.json({ success: true });
}
