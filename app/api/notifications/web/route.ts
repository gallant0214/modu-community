import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

// GET /api/notifications/web — 웹용 알림 목록 조회
export async function GET(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const provider = user.provider || "unknown";
  await supabase
    .from("user_first_seen")
    .upsert({ firebase_uid: user.uid, provider }, { onConflict: "firebase_uid", ignoreDuplicates: true });

  const { data: fs } = await supabase
    .from("user_first_seen")
    .select("seen_at")
    .eq("firebase_uid", user.uid)
    .maybeSingle();
  const firstSeen = fs?.seen_at || new Date().toISOString();

  // 가입 이후 admin_broadcasts + 읽음 여부
  const [bcRes, readsRes] = await Promise.all([
    supabase
      .from("admin_broadcasts")
      .select("id, title, body, broadcast_type, created_at")
      .gte("created_at", firstSeen)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("web_notification_reads")
      .select("notification_id")
      .eq("firebase_uid", user.uid)
      .limit(100000),
  ]);

  if (bcRes.error) return NextResponse.json({ error: bcRes.error.message }, { status: 500 });

  const readSet = new Set((readsRes.data || []).map((r) => r.notification_id));

  const notifications = (bcRes.data || []).map((b) => ({
    ...b,
    is_read: readSet.has(b.id),
  }));

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return NextResponse.json({ notifications, unreadCount });
}

// POST /api/notifications/web — 알림 읽음 처리
export async function POST(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { notificationId, readAll } = await request.json();
  let inserted = 0;

  if (readAll) {
    const { data: allBc } = await supabase.from("admin_broadcasts").select("id").limit(100000);
    const rows = (allBc || []).map((b) => ({
      firebase_uid: user.uid,
      notification_id: b.id,
    }));
    if (rows.length > 0) {
      const { error } = await supabase
        .from("web_notification_reads")
        .upsert(rows, { onConflict: "firebase_uid,notification_id", ignoreDuplicates: true });
      if (!error) inserted = rows.length;
    }
  } else if (notificationId) {
    const { error } = await supabase
      .from("web_notification_reads")
      .upsert(
        { firebase_uid: user.uid, notification_id: notificationId },
        { onConflict: "firebase_uid,notification_id", ignoreDuplicates: true },
      );
    if (!error) inserted = 1;
  }

  return NextResponse.json({ success: true, inserted });
}
