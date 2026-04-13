import { sql } from "@/app/lib/db";
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

  try {
    // firstSeen 조회 (테이블이 없으면 현재 시각 사용)
    let firstSeen = new Date().toISOString();
    try {
      await sql`INSERT INTO user_first_seen (firebase_uid) VALUES (${user.uid}) ON CONFLICT (firebase_uid) DO NOTHING`;
      const fsRows = await sql`SELECT seen_at FROM user_first_seen WHERE firebase_uid = ${user.uid}`;
      if (fsRows[0]?.seen_at) firstSeen = fsRows[0].seen_at;
    } catch {}

    // 3개 쿼리 병렬 실행
    const [rows, countResult, unreadResult] = await Promise.all([
      sql`
        SELECT * FROM notification_logs
        WHERE firebase_uid = ${user.uid} AND created_at >= ${firstSeen}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      sql`
        SELECT COUNT(*) as count FROM notification_logs
        WHERE firebase_uid = ${user.uid} AND created_at >= ${firstSeen}
      `,
      sql`
        SELECT COUNT(*) as count FROM notification_logs
        WHERE firebase_uid = ${user.uid} AND read = false AND created_at >= ${firstSeen}
      `,
    ]);

    return NextResponse.json({
      notifications: rows,
      total: Number(countResult[0]?.count || 0),
      unreadCount: Number(unreadResult[0]?.count || 0),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
