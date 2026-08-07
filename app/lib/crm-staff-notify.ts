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
 * 강사(직원)에게 알림 발송 — 알림함(crm_staff_notifications) 저장 + 강사앱 푸시.
 * 회원 앱 알림(notifyMembersByIds 등)과 동일한 구조의 강사용 버전.
 *
 * - center_member_id: crm_center_members.id (해당 센터에서의 강사 신원)
 * - 푸시는 그 강사의 firebase_uid 로 등록된 crm_staff_device_tokens 전체로 멀티캐스트.
 */
export async function notifyStaffMember(params: {
  centerId: number;
  centerMemberId: number;
  type: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}) {
  const { centerId, centerMemberId, type, title, body, data } = params;
  try {
    // 1) 알림함 저장 (앱의 알림 탭에서 조회)
    await supabase.from("crm_staff_notifications").insert({
      center_id: centerId,
      center_member_id: centerMemberId,
      type,
      title,
      body: body ?? null,
      data_json: (data ?? null) as never,
    });

    // 2) 강사 firebase_uid 조회
    const { data: staff } = await supabase
      .from("crm_center_members")
      .select("firebase_uid")
      .eq("id", centerMemberId)
      .eq("center_id", centerId)
      .maybeSingle();
    if (!staff?.firebase_uid) return;

    // 3) 강사앱 디바이스 토큰으로 푸시 (토큰 미등록이면 알림함만 저장하고 종료)
    const { data: tokens } = await supabase
      .from("crm_staff_device_tokens")
      .select("token")
      .eq("firebase_uid", staff.firebase_uid);
    const tokenList = (tokens ?? []).map((t) => t.token);
    if (tokenList.length === 0) return;

    const messaging = getMessaging(getAdmin());
    for (let i = 0; i < tokenList.length; i += 500) {
      const batch = tokenList.slice(i, i + 500);
      await messaging
        .sendEachForMulticast({
          notification: { title, body },
          data: { type, ...(data ?? {}) },
          apns: { payload: { aps: { sound: "default", badge: 1 } } },
          tokens: batch,
        })
        .catch(() => {});
    }
  } catch (e) {
    console.error("[crm-staff-notify] error", e);
  }
}
