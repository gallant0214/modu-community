import { sql } from "@/app/lib/db";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { NextResponse } from "next/server";

// 알림 읽음 처리
export async function POST(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  try {
    const { id, all } = await request.json();

    if (all) {
      // 전체 읽음 처리
      await sql`UPDATE notification_logs SET read = true WHERE firebase_uid = ${user.uid} AND read = false`;
    } else if (id) {
      // 개별 읽음 처리
      await sql`UPDATE notification_logs SET read = true WHERE id = ${Number(id)} AND firebase_uid = ${user.uid}`;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
