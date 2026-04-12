import { sql } from "@/app/lib/db";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { sendPushToUser } from "@/app/lib/notifications";
import { NextResponse } from "next/server";

// 관리자 브로드캐스트 메시지 발송
export async function POST(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  // 관리자 체크: 환경변수 UID 또는 DB 관리자 이메일
  const adminUids = (process.env.ADMIN_UIDS || "").split(",").map(s => s.trim()).filter(Boolean);
  let isAdmin = adminUids.includes(user.uid);
  if (!isAdmin && user.email) {
    try {
      const adminCheck = await sql`SELECT id FROM admin_emails WHERE email = ${user.email.toLowerCase()} LIMIT 1`;
      isAdmin = adminCheck.length > 0;
    } catch {}
  }
  if (!isAdmin) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다" }, { status: 403 });
  }

  try {
    const { title, body, image_url, link_url, broadcast_type } = await request.json();
    if (!title?.trim() || !body?.trim()) {
      return NextResponse.json({ error: "제목과 내용을 입력해주세요" }, { status: 400 });
    }

    // fail_count 컬럼 확인 (없으면 추가)
    try { await sql`ALTER TABLE admin_broadcasts ADD COLUMN IF NOT EXISTS fail_count INTEGER DEFAULT 0`; } catch {}

    // 브로드캐스트 저장
    const rows = await sql`
      INSERT INTO admin_broadcasts (title, body, image_url, link_url, broadcast_type)
      VALUES (${title.trim()}, ${body.trim()}, ${image_url || null}, ${link_url || null}, ${broadcast_type || "notice"})
      RETURNING id
    `;
    const broadcastId = rows[0].id;

    // 광고 수신 동의한 사용자 목록 조회
    const users = await sql`
      SELECT DISTINCT dp.firebase_uid
      FROM device_tokens dp
      LEFT JOIN notification_preferences np ON dp.firebase_uid = np.firebase_uid
      WHERE np.notify_promo = true OR np.notify_promo IS NULL
    `;

    let sentCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (const u of users) {
      try {
        await sql`
          INSERT INTO notification_logs (firebase_uid, type, title, body, data)
          VALUES (${u.firebase_uid}, 'admin_broadcast', ${title.trim()}, ${body.trim()},
            ${JSON.stringify({ broadcastId: String(broadcastId), broadcast_type: broadcast_type || "notice", image_url, link_url })})
        `;

        await sendPushToUser(
          u.firebase_uid,
          "promo",
          title.trim(),
          body.trim(),
          { type: "admin_broadcast", broadcastId: String(broadcastId) }
        );
        sentCount++;
      } catch (err: any) {
        failCount++;
        if (errors.length < 5) errors.push(err?.message || "알 수 없는 오류");
      }
    }

    // 발송 결과 업데이트
    await sql`UPDATE admin_broadcasts SET sent_count = ${sentCount}, fail_count = ${failCount} WHERE id = ${broadcastId}`;

    return NextResponse.json({ success: true, broadcastId, sentCount, failCount, totalTargets: users.length, errors: errors.length > 0 ? errors : undefined });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 브로드캐스트 목록 조회 (관리자 전용)
export async function GET(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  // 관리자 권한 체크 (POST와 동일 로직)
  const adminUids = (process.env.ADMIN_UIDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  let isAdmin = adminUids.includes(user.uid);
  if (!isAdmin && user.email) {
    try {
      const adminCheck = await sql`SELECT id FROM admin_emails WHERE email = ${user.email.toLowerCase()} LIMIT 1`;
      isAdmin = adminCheck.length > 0;
    } catch {}
  }
  if (!isAdmin) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다" }, { status: 403 });
  }

  try {
    const rows = await sql`
      SELECT * FROM admin_broadcasts ORDER BY created_at DESC LIMIT 50
    `;
    return NextResponse.json({ broadcasts: rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
