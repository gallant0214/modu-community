import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

// GET /api/notifications/web — 웹용 알림 목록 조회
export async function GET(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  try {
    // 테이블 확인
    await sql`CREATE TABLE IF NOT EXISTS web_notification_reads (
      id SERIAL PRIMARY KEY,
      firebase_uid TEXT NOT NULL,
      notification_id INTEGER NOT NULL,
      read_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(firebase_uid, notification_id)
    )`;

    // 관리자 브로드캐스트 알림 목록 (최근 50개)
    const notifications = await sql`
      SELECT
        ab.id,
        ab.title,
        ab.body,
        ab.broadcast_type,
        ab.created_at,
        CASE WHEN wnr.id IS NOT NULL THEN true ELSE false END AS is_read
      FROM admin_broadcasts ab
      LEFT JOIN web_notification_reads wnr
        ON wnr.notification_id = ab.id AND wnr.firebase_uid = ${user.uid}
      ORDER BY ab.created_at DESC
      LIMIT 50
    `;

    // 읽지 않은 알림 수 (notifications 배열에서 직접 계산)
    const unreadCount = notifications.filter((n: any) => !n.is_read).length;

    return NextResponse.json({
      notifications,
      unreadCount,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/notifications/web — 알림 읽음 처리
export async function POST(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  try {
    const { notificationId, readAll } = await request.json();

    // 테이블 확인
    await sql`CREATE TABLE IF NOT EXISTS web_notification_reads (
      id SERIAL PRIMARY KEY,
      firebase_uid TEXT NOT NULL,
      notification_id INTEGER NOT NULL,
      read_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(firebase_uid, notification_id)
    )`;

    if (readAll) {
      // 모두 읽음 처리: 모든 admin_broadcasts를 가져와서 개별 INSERT
      const allBroadcasts = await sql`SELECT id FROM admin_broadcasts`;
      for (const row of allBroadcasts) {
        try {
          await sql`
            INSERT INTO web_notification_reads (firebase_uid, notification_id)
            VALUES (${user.uid}, ${row.id})
            ON CONFLICT (firebase_uid, notification_id) DO NOTHING
          `;
        } catch {}
      }
    } else if (notificationId) {
      // 개별 읽음 처리
      await sql`
        INSERT INTO web_notification_reads (firebase_uid, notification_id)
        VALUES (${user.uid}, ${notificationId})
        ON CONFLICT (firebase_uid, notification_id) DO NOTHING
      `;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
