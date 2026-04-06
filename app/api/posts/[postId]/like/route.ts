import { sql } from "@/app/lib/db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { sendPushToUser } from "@/app/lib/notifications";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const user = await verifyAuth(request);
  if (!user) {
    return NextResponse.json({ error: "로그인을 해주세요" }, { status: 401 });
  }

  const { postId } = await params;
  const id = Number(postId);

  await sql`
    CREATE TABLE IF NOT EXISTS post_likes (
      id SERIAL PRIMARY KEY,
      post_id INT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      ip_address TEXT NOT NULL DEFAULT '',
      firebase_uid TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE post_likes ADD COLUMN IF NOT EXISTS firebase_uid TEXT`;

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";

  const existing = await sql`SELECT id FROM post_likes WHERE post_id = ${id} AND firebase_uid = ${user.uid}`;
  let unliked = false;

  if (existing.length > 0) {
    await sql`DELETE FROM post_likes WHERE post_id = ${id} AND firebase_uid = ${user.uid}`;
    await sql`UPDATE posts SET likes = GREATEST(COALESCE(likes, 0) - 1, 0) WHERE id = ${id}`;
    unliked = true;
  } else {
    try { await sql`INSERT INTO post_likes (post_id, ip_address, firebase_uid) VALUES (${id}, ${ip}, ${user.uid})`; } catch {}
    await sql`UPDATE posts SET likes = COALESCE(likes, 0) + 1 WHERE id = ${id}`;
  }

  const row = await sql`SELECT likes, firebase_uid, title FROM posts WHERE id = ${id}`;
  const newLikes = row[0]?.likes || 0;

  // 좋아요 알림 (누적 카운팅 방식) - 좋아요를 누른 경우만
  if (!unliked && row[0]?.firebase_uid && row[0].firebase_uid !== user.uid) {
    try {
      const postOwnerUid = row[0].firebase_uid;
      const postTitle = (row[0].title || "").substring(0, 30);

      // 사용자 알림 설정 확인 - 좋아요 알림이 꺼져 있으면 로그도 저장하지 않음
      const prefs = await sql`SELECT notify_like FROM notification_preferences WHERE firebase_uid = ${postOwnerUid}`;
      if (prefs.length > 0 && prefs[0].notify_like === false) {
        // 설정 OFF → 로그 저장 안 함, 푸시 발송 안 함
      } else {
      // 기존 읽지 않은 좋아요 알림이 있으면 카운트 업데이트
      const existing = await sql`
        SELECT id, like_count FROM notification_logs
        WHERE firebase_uid = ${postOwnerUid}
          AND type = 'post_like'
          AND data->>'postId' = ${String(id)}
          AND read = false
        ORDER BY created_at DESC LIMIT 1
      `;

      if (existing.length > 0) {
        // 기존 알림의 좋아요 카운트 증가
        const newCount = (existing[0].like_count || 1) + 1;
        await sql`
          UPDATE notification_logs
          SET like_count = ${newCount},
              title = ${"\"" + postTitle + "\" 글에 좋아요 " + newCount + "개"},
              body = ${"회원님의 글에 좋아요가 총 " + newCount + "개 달렸습니다"},
              created_at = NOW()
          WHERE id = ${existing[0].id}
        `;
      } else {
        // 새 알림 생성
        await sql`
          INSERT INTO notification_logs (firebase_uid, type, title, body, data, like_count)
          VALUES (${postOwnerUid}, 'post_like',
            ${"\"" + postTitle + "\" 글에 좋아요 1개"},
            ${"회원님의 글에 좋아요가 1개 달렸습니다"},
            ${JSON.stringify({ postId: String(id) })},
            1)
        `;
      }

      // 푸시 발송 (누적이라도 최신 좋아요만 알림)
      sendPushToUser(
        postOwnerUid,
        "like",
        `"${postTitle}" 글에 좋아요`,
        `회원님의 글에 좋아요가 ${newLikes}개 달렸습니다`,
        { postId: String(id), type: "post_like" }
      ).catch(() => {});
      } // else (설정 ON일 때만 실행)
    } catch {}
  }

  return NextResponse.json({ unliked, likes: newLikes });
}
