import { getApps } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { supabase } from "./supabase";
import { sendPushToUser } from "./notifications";

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

/** ISO 시각 → "5월 2일 (월) 08:30" (KST) */
export function formatKstSlot(iso: string): string {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  const mo = kst.getUTCMonth() + 1;
  const day = kst.getUTCDate();
  const dow = ["일", "월", "화", "수", "목", "금", "토"][kst.getUTCDay()];
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${mo}월 ${day}일 (${dow}) ${hh}:${mm}`;
}

/**
 * 회원 앱(모두의지도사스케줄) 회원에게 푸시. crm_member_device_tokens 사용.
 * data.type 으로 앱에서 라우팅 (reservation_approved / reservation_rejected / reservation_reminder).
 */
export async function sendPushToMember(
  memberId: number,
  type: string,
  title: string,
  body: string,
  data?: Record<string, string>
) {
  // 1) 알림 내역 저장 (앱 알림함/뱃지용 — 푸시 토큰 유무와 무관하게 항상 기록)
  try {
    const { data: mem } = await supabase
      .from("crm_members")
      .select("center_id")
      .eq("id", memberId)
      .maybeSingle();
    await supabase.from("crm_member_notifications").insert({
      center_id: mem?.center_id ?? null,
      member_id: memberId,
      type,
      title,
      body: body ?? null,
      data_json: (data ?? null) as never,
    } as never);
  } catch (e) {
    console.error("[member-notify] log error", e);
  }

  // 2) 실제 푸시 발송
  try {
    const { data: tokens } = await supabase
      .from("crm_member_device_tokens")
      .select("token")
      .eq("member_id", memberId);
    if (!tokens || tokens.length === 0) return;

    const messaging = getMessaging(getAdmin());
    const tokenList = tokens.map((t) => t.token);
    const result = await messaging.sendEachForMulticast({
      notification: { title, body },
      data: { type, ...data },
      apns: { payload: { aps: { sound: "default", badge: 1 } } },
      tokens: tokenList,
    });

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
      await supabase.from("crm_member_device_tokens").delete().in("token", toDelete);
    }
  } catch (error) {
    console.error("[member-notify] push error", error);
  }
}

/**
 * 회원이 예약을 요청하면 담당 트레이너에게 알림.
 * 트레이너는 CRM 로그인 사용자(firebase_uid) → 기존 sendPushToUser 재사용.
 */
export async function notifyCenterStaffNewRequest(params: {
  centerId: number;
  trainerMemberId: number;
  memberName: string;
  startsAt: string;
}) {
  const { data: trainer } = await supabase
    .from("crm_center_members")
    .select("firebase_uid")
    .eq("id", params.trainerMemberId)
    .eq("center_id", params.centerId)
    .maybeSingle();
  if (!trainer?.firebase_uid) return;

  await sendPushToUser(
    trainer.firebase_uid,
    "crm_reservation_request",
    "새 예약 요청",
    `${params.memberName}님이 ${formatKstSlot(params.startsAt)} 수업을 요청했어요`,
    { kind: "reservation_request" }
  );
}
