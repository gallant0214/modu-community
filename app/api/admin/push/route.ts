import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAdmin, verifyAdminPassword } from "@/app/lib/admin-auth";
import { sanitize, validateLength } from "@/app/lib/security";
import { getApps } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

export const dynamic = "force-dynamic";

function getAdmin() {
  const apps = getApps();
  if (apps.length === 0) {
    const { initializeApp, cert } = require("firebase-admin/app");
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccount) {
      initializeApp({ credential: cert(JSON.parse(serviceAccount)) });
    } else {
      initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || "moducm-f2edf" });
    }
  }
  return getApps()[0];
}

async function logPush(safeTitle: string, safeBody: string, data: Record<string, unknown>) {
  await supabase.from("notification_logs").insert({
    firebase_uid: "admin",
    type: "promo",
    title: safeTitle,
    body: safeBody,
    data: JSON.stringify(data),
  });
}

/**
 * POST /api/admin/push  Body: { password, title, body, url? }
 */
export async function POST(request: Request) {
  const reqBody = await request.json();
  const { password, title, body, url } = reqBody;

  const authError = await verifyAdmin(request, password);
  if (authError) return authError;

  if (!title?.trim() || !body?.trim()) {
    return NextResponse.json({ error: "제목과 내용을 입력해주세요" }, { status: 400 });
  }

  const safeTitle = sanitize(validateLength(title.trim(), 100));
  const safeBody = sanitize(validateLength(body.trim(), 500));

  // promo 알림이 켜진 사용자의 device_tokens 조회
  const { data: tokenRows, error: tokenErr } = await supabase
    .from("device_tokens")
    .select("token, firebase_uid, platform")
    .limit(100000);
  if (tokenErr) {
    return NextResponse.json({ error: tokenErr.message }, { status: 500 });
  }

  // 알림 설정 조회
  const uids = [...new Set((tokenRows || []).map((t) => t.firebase_uid))];
  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("firebase_uid, notify_promo")
    .in("firebase_uid", uids);
  const prefMap = new Map((prefs || []).map((p) => [p.firebase_uid, p.notify_promo]));

  const tokens = (tokenRows || []).filter((t) => {
    const pref = prefMap.get(t.firebase_uid);
    return pref === null || pref === undefined || pref === true;
  });

  if (tokens.length === 0) {
    await logPush(safeTitle, safeBody, { url: url || "", sent: 0, failed: 0, message: "전송 대상 없음" });
    return NextResponse.json({ success: true, sent: 0, failed: 0, total: 0, message: "등록된 디바이스가 없어 전송 대상이 없습니다" });
  }

  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    await logPush(safeTitle, safeBody, { url: url || "", sent: 0, failed: tokens.length, message: "FCM 서비스 계정 미설정" });
    return NextResponse.json({ success: true, sent: 0, failed: tokens.length, total: tokens.length, message: "FCM 서비스 계정이 설정되지 않아 알림이 발송되지 않았습니다." });
  }

  const app = getAdmin();
  const messaging = getMessaging(app);

  let sent = 0;
  let failed = 0;
  const invalidTokens: string[] = [];

  for (const t of tokens) {
    try {
      await messaging.send({
        token: t.token,
        notification: { title: safeTitle, body: safeBody },
        data: {
          type: "promo",
          ...(url ? { url } : {}),
        },
        apns: { payload: { aps: { sound: "default", badge: 1 } } },
        android: { priority: "high" as const, notification: { sound: "default", channelId: "default" } },
      });
      sent++;
    } catch (err: unknown) {
      failed++;
      const code = (err as { code?: string })?.code;
      if (
        code === "messaging/invalid-registration-token" ||
        code === "messaging/registration-token-not-registered"
      ) {
        invalidTokens.push(t.token);
      }
    }
  }

  // 무효한 토큰 정리
  for (const token of invalidTokens) {
    await supabase.from("device_tokens").delete().eq("token", token);
  }

  await logPush(safeTitle, safeBody, { url: url || "", sent, failed });

  return NextResponse.json({ success: true, sent, failed, total: tokens.length });
}

/**
 * GET /api/admin/push?password=xxx — 푸시 전송 이력 조회
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const password = searchParams.get("password") || "";

  if (!(await verifyAdminPassword(password))) {
    return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("notification_logs")
    .select("id, title, body, data, created_at")
    .eq("type", "promo")
    .eq("firebase_uid", "admin")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return NextResponse.json({ logs: [] });
  return NextResponse.json({ logs: data });
}
