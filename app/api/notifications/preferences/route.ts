import { supabase } from "@/app/lib/supabase";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DEFAULT_PREFS = {
  notify_comment: true,
  notify_reply: true,
  notify_like: true,
  notify_job: true,
  notify_trade: true,
  notify_notice: true,
  notify_promo: false,
  notify_keyword: true,
  notify_message: true,
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
    notify_trade: (data as { notify_trade?: boolean | null }).notify_trade ?? true,
    notify_notice: data.notify_notice,
    notify_promo: data.notify_promo,
    notify_keyword: data.notify_keyword,
    notify_message: (data as { notify_message?: boolean | null }).notify_message ?? true,
  });
}

// 알림 설정 저장
export async function POST(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const body = await request.json();

  // 정보통신망법: 광고/프로모션 동의 시점 증빙 보관
  // - 기존 동의 시점 조회 후 OFF→ON 전환되는 순간에만 timestamp 기록
  // - ON→ON 유지 시에는 기존 timestamp 보존
  // - ON→OFF 시에는 timestamp 유지 (마지막 동의 이력 흔적 보존)
  const { data: existing } = await supabase
    .from("notification_preferences")
    .select("notify_promo, notify_promo_agreed_at" as never)
    .eq("firebase_uid", user.uid)
    .maybeSingle();
  const prevPromo = (existing as { notify_promo?: boolean | null } | null)?.notify_promo ?? false;
  const prevAgreedAt = (existing as { notify_promo_agreed_at?: string | null } | null)?.notify_promo_agreed_at ?? null;
  const nextPromo = body.notify_promo ?? false;
  const turnedOn = !prevPromo && nextPromo === true;
  const promoAgreedAt = turnedOn ? new Date().toISOString() : prevAgreedAt;

  const prefs = {
    firebase_uid: user.uid,
    notify_comment: body.notify_comment ?? true,
    notify_reply: body.notify_reply ?? true,
    notify_like: body.notify_like ?? true,
    notify_job: body.notify_job ?? true,
    notify_trade: body.notify_trade ?? true,
    notify_notice: body.notify_notice ?? true,
    notify_promo: nextPromo,
    notify_promo_agreed_at: promoAgreedAt,
    notify_keyword: body.notify_keyword ?? true,
    notify_message: body.notify_message ?? true,
  };

  const { error } = await supabase
    .from("notification_preferences")
    .upsert(prefs as never, { onConflict: "firebase_uid" });

  if (error) {
    console.error("Notification prefs POST error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, promo_agreed_at: promoAgreedAt });
}
