import { getApps } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { sql } from "./db";

// firebase-admin은 firebase-admin.ts에서 이미 초기화됨
function getAdmin() {
  // 이미 초기화된 앱을 가져오기 위해 verifyAuth를 한번 import하면 초기화됨
  const apps = getApps();
  if (apps.length === 0) {
    // 직접 초기화
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
 * 특정 사용자에게 푸시 알림 전송
 */
export async function sendPushToUser(
  firebaseUid: string,
  type: string,
  title: string,
  body: string,
  data?: Record<string, string>
) {
  try {
    // 1. 사용자 알림 설정 확인
    const prefs = await sql`
      SELECT * FROM notification_preferences WHERE firebase_uid = ${firebaseUid}
    `;

    if (prefs.length > 0) {
      const pref = prefs[0];
      const typeMap: Record<string, string> = {
        comment: "notify_comment",
        reply: "notify_reply",
        job: "notify_job",
        notice: "notify_notice",
        promo: "notify_promo",
        keyword: "notify_keyword",
        like: "notify_like",
      };
      const prefKey = typeMap[type];
      if (prefKey && pref[prefKey] === false) {
        return; // 사용자가 해당 알림을 꺼둠
      }
    }

    // 2. 알림 로그 저장 (설정 ON이면 항상 저장, 푸시 토큰과 무관)
    await sql`
      INSERT INTO notification_logs (firebase_uid, type, title, body, data)
      VALUES (${firebaseUid}, ${type}, ${title}, ${body}, ${JSON.stringify(data || {})})
    `;

    // 3. 디바이스 토큰 조회 (푸시 발송용)
    const tokens = await sql`
      SELECT token FROM device_tokens WHERE firebase_uid = ${firebaseUid}
    `;

    if (tokens.length === 0) return;

    // 4. FCM 발송
    const app = getAdmin();
    const messaging = getMessaging(app);

    const tokenList = tokens.map((t: any) => t.token);

    const message = {
      notification: { title, body },
      data: { type, ...data },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
    };

    // 각 토큰에 개별 발송 (실패한 토큰 정리)
    for (const token of tokenList) {
      try {
        await messaging.send({ ...message, token });
      } catch (err: any) {
        // 잘못된 토큰 삭제
        if (
          err?.code === "messaging/invalid-registration-token" ||
          err?.code === "messaging/registration-token-not-registered"
        ) {
          await sql`DELETE FROM device_tokens WHERE token = ${token}`;
        }
      }
    }
  } catch (error) {
    console.error("Push notification error:", error);
  }
}

/**
 * 키워드 알림: 새 게시글/구인글에 키워드가 포함된 사용자에게 알림
 */
export async function sendKeywordAlerts(
  contentTitle: string,
  contentBody: string,
  type: "post" | "job",
  targetId: number,
  excludeUid?: string
) {
  try {
    // 키워드 알림이 켜져있는 사용자 조회
    const users = await sql`
      SELECT dp.firebase_uid, dp.token
      FROM device_tokens dp
      JOIN notification_preferences np ON dp.firebase_uid = np.firebase_uid
      WHERE np.notify_keyword = true
      ${excludeUid ? sql`AND dp.firebase_uid != ${excludeUid}` : sql``}
    `;

    // 각 사용자의 키워드는 클라이언트 AsyncStorage에 저장되어 있어서
    // 서버에서는 전체 텍스트 기반으로 관심 사용자에게 알림
    // (향후 키워드를 서버에 저장하면 매칭 가능)
    // 현재는 키워드 알림 설정이 켜진 사용자에게 새 글 알림 발송
    const uniqueUids = [...new Set(users.map((u: any) => u.firebase_uid))];

    for (const uid of uniqueUids) {
      if (uid === excludeUid) continue;
      await sendPushToUser(
        uid as string,
        "keyword",
        type === "post" ? "새 게시글" : "새 구인글",
        contentTitle,
        { targetType: type, targetId: String(targetId) }
      );
    }
  } catch (error) {
    console.error("Keyword alert error:", error);
  }
}
