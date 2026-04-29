import { getApps } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { supabase } from "./supabase";

function getAdmin() {
  const apps = getApps();
  if (apps.length === 0) {
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
    const { data: pref } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("firebase_uid", firebaseUid)
      .maybeSingle();

    if (pref) {
      const typeMap: Record<string, keyof typeof pref> = {
        comment: "notify_comment",
        reply: "notify_reply",
        job: "notify_job",
        notice: "notify_notice",
        promo: "notify_promo",
        keyword: "notify_keyword",
        like: "notify_like",
        message: "notify_message",
      };
      const prefKey = typeMap[type];
      if (prefKey && pref[prefKey] === false) {
        return; // 알림 OFF
      }
    }

    // 2. 알림 로그 저장
    await supabase.from("notification_logs").insert({
      firebase_uid: firebaseUid,
      type,
      title,
      body,
      data: JSON.stringify(data || {}),
    });

    // 3. 디바이스 토큰 조회
    const { data: tokens } = await supabase
      .from("device_tokens")
      .select("token")
      .eq("firebase_uid", firebaseUid);

    if (!tokens || tokens.length === 0) return;

    // 4. FCM 발송
    const app = getAdmin();
    const messaging = getMessaging(app);

    const message = {
      notification: { title, body },
      data: { type, ...data },
      apns: {
        payload: { aps: { sound: "default", badge: 1 } },
      },
    };

    for (const t of tokens) {
      try {
        await messaging.send({ ...message, token: t.token });
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (
          code === "messaging/invalid-registration-token" ||
          code === "messaging/registration-token-not-registered"
        ) {
          await supabase.from("device_tokens").delete().eq("token", t.token);
        }
      }
    }
  } catch (error) {
    console.error("Push notification error:", error);
  }
}

/**
 * 키워드 알림: 새 게시글/구인글에 키워드 알림 켜둔 사용자에게 알림
 */
export async function sendKeywordAlerts(
  contentTitle: string,
  contentBody: string,
  type: "post" | "job",
  targetId: number,
  excludeUid?: string
) {
  try {
    // 키워드 알림이 켜진 사용자의 device_tokens 조회 (별도 쿼리 + JS join)
    const { data: tokens } = await supabase
      .from("device_tokens")
      .select("firebase_uid")
      .limit(100000);
    const uids = [...new Set((tokens || []).map((t) => t.firebase_uid))];

    if (uids.length === 0) return;

    const { data: prefs } = await supabase
      .from("notification_preferences")
      .select("firebase_uid, notify_keyword")
      .in("firebase_uid", uids);
    const prefMap = new Map((prefs || []).map((p) => [p.firebase_uid, p.notify_keyword]));

    const targetUids = uids.filter((uid) => {
      if (uid === excludeUid) return false;
      return prefMap.get(uid) !== false; // 명시적 OFF가 아닌 경우 발송
    });

    for (const uid of targetUids) {
      await sendPushToUser(
        uid as string,
        "keyword",
        type === "post" ? "새 게시글" : "새 구인글",
        contentTitle,
        { targetType: type, targetId: String(targetId) },
      );
    }
  } catch (error) {
    console.error("Keyword alert error:", error);
  }
}
