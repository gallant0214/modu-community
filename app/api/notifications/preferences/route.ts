import { supabase } from "@/app/lib/supabase";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DEFAULT_PREFS = {
  notify_comment: true,
  notify_reply: true,
  notify_like: true,
  notify_job: true,
  notify_notice: true,
  notify_promo: false,
  notify_keyword: true,
};

// 알림 설정 조회
export async function GET(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { data, error } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("firebase_uid", user.uid)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json(DEFAULT_PREFS);

  return NextResponse.json({
    notify_comment: data.notify_comment,
    notify_reply: data.notify_reply,
    notify_like: data.notify_like ?? true,
    notify_job: data.notify_job,
    notify_notice: data.notify_notice,
    notify_promo: data.notify_promo,
    notify_keyword: data.notify_keyword,
  });
}

// 알림 설정 저장
export async function POST(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const body = await request.json();
  const prefs = {
    firebase_uid: user.uid,
    notify_comment: body.notify_comment ?? true,
    notify_reply: body.notify_reply ?? true,
    notify_like: body.notify_like ?? true,
    notify_job: body.notify_job ?? true,
    notify_notice: body.notify_notice ?? true,
    notify_promo: body.notify_promo ?? false,
    notify_keyword: body.notify_keyword ?? true,
  };

  const { error } = await supabase
    .from("notification_preferences")
    .upsert(prefs, { onConflict: "firebase_uid" });

  if (error) {
    console.error("Notification prefs POST error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
