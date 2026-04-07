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

    // 읽지 않은 알림 수
    const unreadResult = await sql`
      SELECT COUNT(*)::int AS count
      FROM admin_broadcasts ab
      WHERE NOT EXISTS (
        SELECT 1 FROM web_notification_reads wnr
        WHERE wnr.notification_id = ab.id AND wnr.firebase_uid = ${user.uid}
      )
    `;

    return NextResponse.json({
      notifications,
      unreadCount: unreadResult[0]?.count || 0,
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

    if (readAll) {
      // 모두 읽음 처리
      await sql`
        INSERT INTO web_notification_reads (firebase_uid, notification_id)
        SELECT ${user.uid}, ab.id
        FROM admin_broadcasts ab
        WHERE NOT EXISTS (
          SELECT 1 FROM web_notification_reads wnr
          WHERE wnr.notification_id = ab.id AND wnr.firebase_uid = ${user.uid}
        )
        ON CONFLICT DO NOTHING
      `;
    } else if (notificationId) {
      // 개별 읽음 처리
      await sql`
        INSERT INTO web_notification_reads (firebase_uid, notification_id)
        VALUES (${user.uid}, ${notificationId})
        ON CONFLICT DO NOTHING
      `;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
