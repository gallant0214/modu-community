import { supabase } from "@/app/lib/supabase";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// 내 알림 목록 조회
export async function GET(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") || "1");
  const limit = 30;
  const offset = (page - 1) * limit;

  // user_first_seen 보장 (첫 조회 시각 기록)
  let firstSeen = new Date().toISOString();
  await supabase
    .from("user_first_seen")
    .upsert({ firebase_uid: user.uid }, { onConflict: "firebase_uid", ignoreDuplicates: true });
  const { data: fs } = await supabase
    .from("user_first_seen")
    .select("seen_at")
    .eq("firebase_uid", user.uid)
    .maybeSingle();
  if (fs?.seen_at) firstSeen = fs.seen_at;

  const [listRes, countRes, unreadRes] = await Promise.all([
    supabase
      .from("notification_logs")
      .select("*")
      .eq("firebase_uid", user.uid)
      .gte("created_at", firstSeen)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    supabase
      .from("notification_logs")
      .select("*", { count: "exact", head: true })
      .eq("firebase_uid", user.uid)
      .gte("created_at", firstSeen),
    supabase
      .from("notification_logs")
      .select("*", { count: "exact", head: true })
      .eq("firebase_uid", user.uid)
      .eq("read", false)
      .gte("created_at", firstSeen),
  ]);

  if (listRes.error) {
    return NextResponse.json({ error: listRes.error.message }, { status: 500 });
  }

  return NextResponse.json({
    notifications: listRes.data,
    total: countRes.count ?? 0,
    unreadCount: unreadRes.count ?? 0,
  });
}
