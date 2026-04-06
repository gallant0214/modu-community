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
    const rows = await sql`
      SELECT * FROM notification_logs
      WHERE firebase_uid = ${user.uid}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const countResult = await sql`
      SELECT COUNT(*) as count FROM notification_logs WHERE firebase_uid = ${user.uid}
    `;

    const unreadResult = await sql`
      SELECT COUNT(*) as count FROM notification_logs
      WHERE firebase_uid = ${user.uid} AND read = false
    `;

    return NextResponse.json({
      notifications: rows,
      total: Number(countResult[0]?.count || 0),
      unreadCount: Number(unreadResult[0]?.count || 0),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
