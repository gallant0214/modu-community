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
      // notify_trade 는 supabase generated types 에 아직 없을 수 있어 string 키로 처리
      const typeMap: Record<string, string> = {
        comment: "notify_comment",
        reply: "notify_reply",
        job: "notify_job",
        notice: "notify_notice",
        promo: "notify_promo",
        ad: "notify_promo",       // 관리자 UI 가 "ad" 로 보냄 → notify_promo 로 매핑
        event: "notify_promo",    // 이벤트도 광고와 같은 토글 (별도 토글 없음)
        keyword: "notify_keyword",
        like: "notify_like",
        message: "notify_message",
        trade: "notify_trade",
        trade_price_drop: "notify_trade",
      };
      const prefKey = typeMap[type];
      if (prefKey && (pref as Record<string, unknown>)[prefKey] === false) {
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

    // 4. FCM 발송 — 모든 토큰 병렬, 한 번의 배치 호출
    const app = getAdmin();
    const messaging = getMessaging(app);

    const tokenList = tokens.map((t) => t.token);
    const multicast = {
      notification: { title, body },
      data: { type, ...data },
      apns: {
        payload: { aps: { sound: "default", badge: 1 } },
      },
      tokens: tokenList,
    };

    const result = await messaging.sendEachForMulticast(multicast);
    // 실패 토큰 — 만료/무효 만 정리
    const toDelete: string[] = [];
    result.responses.forEach((r, idx) => {
      if (!r.success) {
        const code = (r.error as { code?: string } | undefined)?.code;
        if (
          code === "messaging/invalid-registration-token" ||
          code === "messaging/registration-token-not-registered"
        ) {
          toDelete.push(tokenList[idx]);
        }
      }
    });
    if (toDelete.length > 0) {
      await supabase.from("device_tokens").delete().in("token", toDelete);
    }
  } catch (error) {
    console.error("Push notification error:", error);
  }
}

/**
 * 키워드 알림 — 새 게시글/구인글/거래글이 작성됐을 때, 사용자가 등록해 둔
 *  키워드(user_keywords) 가 제목/본문에 실제로 매칭되는 경우에만 푸시.
 *
 *  필터 단계:
 *  1) user_keywords 전체 로드 → 사용자별 키워드 set 구성
 *  2) 컨텐츠(title+body) 와 각 키워드를 부분 일치(대소문자 무시) 비교 →
 *     일치한 사용자 uid 만 후보로 수집
 *  3) excludeUid(작성자) 제외
 *  4) notification_preferences.notify_keyword 가 false 인 사용자 제외
 *  5) sendPushToUser 호출 (해당 함수 내부에서도 한 번 더 안전 체크)
 */
export async function sendKeywordAlerts(
  contentTitle: string,
  contentBody: string,
  type: "post" | "job" | "trade",
  targetId: number,
  excludeUid?: string,
) {
  try {
    // 1) 전체 유저 키워드 로드
    const { data: kwRows } = await supabase
      .from("user_keywords")
      .select("firebase_uid, keyword");
    if (!kwRows || kwRows.length === 0) return;

    // 2) 컨텐츠와 키워드 매칭 (lowercase 부분 일치)
    const haystack = `${contentTitle ?? ""}\n${contentBody ?? ""}`.toLowerCase();
    const matchedUids = new Set<string>();
    for (const row of kwRows) {
      const kw = String(row.keyword || "").trim().toLowerCase();
      if (!kw) continue;
      if (haystack.includes(kw)) {
        matchedUids.add(row.firebase_uid);
      }
    }
    if (excludeUid) matchedUids.delete(excludeUid);
    if (matchedUids.size === 0) return;

    // 3) notify_keyword 가 명시적 OFF 인 사용자 제외
    const uidArr = Array.from(matchedUids);
    const { data: prefs } = await supabase
      .from("notification_preferences")
      .select("firebase_uid, notify_keyword")
      .in("firebase_uid", uidArr);
    const prefMap = new Map((prefs || []).map((p) => [p.firebase_uid, p.notify_keyword]));
    const finalUids = uidArr.filter((uid) => prefMap.get(uid) !== false);

    // 4) 발송
    const titleLabel =
      type === "post" ? "새 게시글" :
      type === "job" ? "새 구인글" :
      "새 거래글";
    for (const uid of finalUids) {
      await sendPushToUser(
        uid,
        "keyword",
        titleLabel,
        contentTitle,
        { targetType: type, targetId: String(targetId) },
      );
    }
  } catch (error) {
    console.error("Keyword alert error:", error);
  }
}
