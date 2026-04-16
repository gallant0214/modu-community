import { sql } from "@/app/lib/db";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { NextResponse } from "next/server";

// 알림 설정 조회
export async function GET(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  try {
    const rows = await sql`
      SELECT * FROM notification_preferences WHERE firebase_uid = ${user.uid}
    `;

    if (rows.length === 0) {
      // 기본값 반환
      return NextResponse.json({
        notify_comment: true,
        notify_reply: true,
        notify_like: true,
        notify_job: true,
        notify_notice: true,
        notify_promo: false,
        notify_keyword: true,
      });
    }

    const pref = rows[0];
    return NextResponse.json({
      notify_comment: pref.notify_comment,
      notify_reply: pref.notify_reply,
      notify_like: pref.notify_like ?? true,
      notify_job: pref.notify_job,
      notify_notice: pref.notify_notice,
      notify_promo: pref.notify_promo,
      notify_keyword: pref.notify_keyword,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 알림 설정 저장
export async function POST(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  try {
    const body = await request.json();
    const {
      notify_comment = true,
      notify_reply = true,
      notify_like = true,
      notify_job = true,
      notify_notice = true,
      notify_promo = false,
      notify_keyword = true,
    } = body;

    await sql`
      INSERT INTO notification_preferences
        (firebase_uid, notify_comment, notify_reply, notify_like, notify_job, notify_notice, notify_promo, notify_keyword, updated_at)
      VALUES
        (${user.uid}, ${notify_comment}, ${notify_reply}, ${notify_like}, ${notify_job}, ${notify_notice}, ${notify_promo}, ${notify_keyword}, NOW())
      ON CONFLICT (firebase_uid)
      DO UPDATE SET
        notify_comment = ${notify_comment},
        notify_reply = ${notify_reply},
        notify_like = ${notify_like},
        notify_job = ${notify_job},
        notify_notice = ${notify_notice},
        notify_promo = ${notify_promo},
        notify_keyword = ${notify_keyword},
        updated_at = NOW()
    `;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
