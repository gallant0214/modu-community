import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
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

/**
 * POST /api/admin/push
 * Body: { password, title, body, url? }
 * 모든 등록된 디바이스에 푸시 알림 전송
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

  try {
    // 모든 디바이스 토큰 조회 (promo 알림이 켜진 사용자만)
    const tokens = await sql`
      SELECT DISTINCT dt.token, dt.firebase_uid, dt.platform
      FROM device_tokens dt
      LEFT JOIN notification_preferences np ON dt.firebase_uid = np.firebase_uid
      WHERE np.notify_promo IS NULL OR np.notify_promo = true
    `;

    if (tokens.length === 0) {
      return NextResponse.json({ success: true, sent: 0, message: "전송 대상이 없습니다" });
    }

    const app = getAdmin();
    const messaging = getMessaging(app);

    let sent = 0;
    let failed = 0;
    const invalidTokens: string[] = [];

    // 각 토큰에 개별 발송
    for (const t of tokens) {
      try {
        await messaging.send({
          token: t.token,
          notification: { title: safeTitle, body: safeBody },
          data: {
            type: "promo",
            ...(url ? { url } : {}),
          },
          apns: {
            payload: { aps: { sound: "default", badge: 1 } },
          },
          android: {
            priority: "high" as const,
            notification: { sound: "default", channelId: "default" },
          },
        });
        sent++;
      } catch (err: any) {
        failed++;
        if (
          err?.code === "messaging/invalid-registration-token" ||
          err?.code === "messaging/registration-token-not-registered"
        ) {
          invalidTokens.push(t.token);
        }
      }
    }

    // 무효한 토큰 정리
    for (const token of invalidTokens) {
      await sql`DELETE FROM device_tokens WHERE token = ${token}`;
    }

    // 알림 로그 저장
    await sql`
      INSERT INTO notification_logs (firebase_uid, type, title, body, data)
      VALUES ('admin', 'promo', ${safeTitle}, ${safeBody}, ${JSON.stringify({ url: url || "", sent, failed })})
    `;

    return NextResponse.json({ success: true, sent, failed, total: tokens.length });
  } catch (error: any) {
    console.error("Admin push error:", error);
    return NextResponse.json({ error: "푸시 전송 중 오류가 발생했습니다" }, { status: 500 });
  }
}

/**
 * GET /api/admin/push?password=xxx
 * 푸시 전송 이력 조회
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const password = searchParams.get("password") || "";

  const { verifyAdminPassword } = require("@/app/lib/admin-auth");
  if (!(await verifyAdminPassword(password))) {
    return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
  }

  try {
    const logs = await sql`
      SELECT id, title, body, data, created_at
      FROM notification_logs
      WHERE type = 'promo' AND firebase_uid = 'admin'
      ORDER BY created_at DESC
      LIMIT 20
    `;
    return NextResponse.json({ logs });
  } catch {
    return NextResponse.json({ logs: [] });
  }
}
