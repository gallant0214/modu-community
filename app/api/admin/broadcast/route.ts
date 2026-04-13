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

    // 브로드캐스트 저장
    const rows = await sql`
      INSERT INTO admin_broadcasts (title, body, image_url, link_url, broadcast_type)
      VALUES (${title.trim()}, ${body.trim()}, ${image_url || null}, ${link_url || null}, ${broadcast_type || "notice"})
      RETURNING id
    `;
    const broadcastId = rows[0].id;

    // broadcast_type에 따라 올바른 알림 설정 기준으로 사용자 필터
    const bType = broadcast_type || "notice";
    const isPromo = bType === "promo";

    // 해당 알림을 켜둔 사용자 조회 (설정 없는 사용자도 포함 — 기본 ON)
    const users = isPromo
      ? await sql`
          SELECT DISTINCT dp.firebase_uid
          FROM device_tokens dp
          LEFT JOIN notification_preferences np ON dp.firebase_uid = np.firebase_uid
          WHERE COALESCE(np.notify_promo, false) = true
        `
      : await sql`
          SELECT DISTINCT dp.firebase_uid
          FROM device_tokens dp
          LEFT JOIN notification_preferences np ON dp.firebase_uid = np.firebase_uid
          WHERE COALESCE(np.notify_notice, true) = true
        `;

    let sentCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    // sendPushToUser가 알림 로그 + FCM 발송을 모두 처리
    for (const u of users) {
      try {
        await sendPushToUser(
          u.firebase_uid,
          bType,
          title.trim(),
          body.trim(),
          { type: "admin_broadcast", broadcastId: String(broadcastId), broadcast_type: bType, image_url: image_url || "", link_url: link_url || "" }
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
