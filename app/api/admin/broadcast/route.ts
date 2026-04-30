import { supabase } from "@/app/lib/supabase";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { sendPushToUser } from "@/app/lib/notifications";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function checkAdmin(uid: string, email: string | null | undefined) {
  const adminUids = (process.env.ADMIN_UIDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (adminUids.includes(uid)) return true;
  if (email) {
    const { count } = await supabase
      .from("admin_emails")
      .select("id", { count: "exact", head: true })
      .eq("email", email.toLowerCase());
    if ((count ?? 0) > 0) return true;
  }
  return false;
}

// 관리자 브로드캐스트 메시지 발송
export async function POST(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  if (!(await checkAdmin(user.uid, user.email))) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다" }, { status: 403 });
  }

  const { title, body, image_url, link_url, broadcast_type } = await request.json();
  if (!title?.trim() || !body?.trim()) {
    return NextResponse.json({ error: "제목과 내용을 입력해주세요" }, { status: 400 });
  }

  // 브로드캐스트 저장
  const { data: bc, error: insertErr } = await supabase
    .from("admin_broadcasts")
    .insert({
      title: title.trim(),
      body: body.trim(),
      image_url: image_url || null,
      link_url: link_url || null,
      broadcast_type: broadcast_type || "notice",
    })
    .select("id")
    .single();
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
  const broadcastId = bc.id;

  const bType = broadcast_type || "notice";
  // "ad" / "promo" 모두 광고 유형으로 취급 (관리자 UI 는 "ad" 로 보냄)
  const isPromo = bType === "promo" || bType === "ad";

  // 디바이스 등록된 모든 사용자
  const { data: tokens } = await supabase
    .from("device_tokens")
    .select("firebase_uid")
    .limit(100000);
  const uniqueUids = [...new Set((tokens || []).map((t) => t.firebase_uid))];

  // 알림 설정 조회
  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("firebase_uid, notify_promo, notify_notice")
    .in("firebase_uid", uniqueUids);
  const prefMap = new Map((prefs || []).map((p) => [p.firebase_uid, p]));

  // 필터링 (설정 없으면 promo는 제외, notice는 포함이 기본)
  const targetUids = uniqueUids.filter((uid) => {
    const p = prefMap.get(uid);
    return isPromo ? p?.notify_promo === true : p?.notify_notice !== false;
  });

  let sentCount = 0;
  let failCount = 0;
  const errors: string[] = [];

  for (const uid of targetUids) {
    try {
      await sendPushToUser(uid, bType, title.trim(), body.trim(), {
        type: "admin_broadcast",
        broadcastId: String(broadcastId),
        broadcast_type: bType,
        image_url: image_url || "",
        link_url: link_url || "",
      });
      sentCount++;
    } catch (err: unknown) {
      failCount++;
      if (errors.length < 5) {
        errors.push(err instanceof Error ? err.message : "알 수 없는 오류");
      }
    }
  }

  await supabase
    .from("admin_broadcasts")
    .update({ sent_count: sentCount, fail_count: failCount })
    .eq("id", broadcastId);

  return NextResponse.json({
    success: true,
    broadcastId,
    sentCount,
    failCount,
    totalTargets: targetUids.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}

// 브로드캐스트 목록 조회 (관리자 전용)
export async function GET(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  if (!(await checkAdmin(user.uid, user.email))) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("admin_broadcasts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ broadcasts: data });
}
