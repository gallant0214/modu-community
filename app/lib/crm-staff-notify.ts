import { getApps } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { supabase } from "./supabase";
import { buildCheckinSummary } from "./crm-checkin";

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
    // 0) 강사 알림 설정 확인 — 해당 유형 알림을 껐으면 저장·발송 모두 스킵
    const PREF_COLUMN: Record<string, string> = {
      reservation_request: "notify_reservation_request",
      reservation_cancelled: "notify_reservation_cancelled",
      member_attendance: "notify_attendance",
    };
    const prefCol = PREF_COLUMN[type];
    if (prefCol) {
      const { data: pref } = await supabase
        .from("crm_staff_notification_prefs")
        .select(prefCol)
        .eq("center_member_id", centerMemberId)
        .maybeSingle();
      if (pref && (pref as unknown as Record<string, unknown>)[prefCol] === false) return false;
    }

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
    if (!staff?.firebase_uid) return true;

    // 3) 강사앱 디바이스 토큰으로 푸시 (토큰 미등록이면 알림함만 저장하고 종료)
    const { data: tokens } = await supabase
      .from("crm_staff_device_tokens")
      .select("token")
      .eq("firebase_uid", staff.firebase_uid);
    const tokenList = (tokens ?? []).map((t) => t.token);
    if (tokenList.length === 0) return true;

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
    return true;
  } catch (e) {
    console.error("[crm-staff-notify] error", e);
    return true;
  }
}

/**
 * 회원 출석/퇴실 시 해당 센터의 대표자·관리자(출석알림 ON)에게 알림.
 * - 대상: 그 센터의 owner/admin 중 crm_staff_notification_prefs.notify_attendance=true
 * - kind: 'in'(출석) | 'out'(퇴실)
 */
export async function notifyCenterStaffAttendance(params: {
  centerId: number;
  memberId?: number;
  memberName: string;
  kind: "in" | "out";
}) {
  const { centerId, memberId, memberName, kind } = params;
  try {
    const { data: staff } = await supabase
      .from("crm_center_members")
      .select("id")
      .eq("center_id", centerId)
      .eq("status", "active")
      .in("role", ["owner", "admin"]);
    const ids = (staff ?? []).map((s) => s.id);
    if (ids.length === 0) return;

    const { data: prefs } = await supabase
      .from("crm_staff_notification_prefs")
      .select("center_member_id, notify_attendance")
      .in("center_member_id", ids);
    const onIds = new Set(
      (prefs ?? []).filter((p) => p.notify_attendance === true).map((p) => p.center_member_id)
    );
    if (onIds.size === 0) return;

    // 센터명 + 금일 방문 인원 + 회원 이용권/수강권 요약
    const todayYmd = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const dayStartUtc = new Date(`${todayYmd}T00:00:00+09:00`).toISOString();
    const [{ data: center }, todayAtt, summary] = await Promise.all([
      supabase.from("crm_centers").select("name").eq("id", centerId).maybeSingle(),
      supabase.from("crm_attendances").select("member_id").eq("center_id", centerId).gte("checked_in_at", dayStartUtc),
      memberId ? buildCheckinSummary(centerId, memberId).catch(() => null) : Promise.resolve(null),
    ]);
    const centerName = center?.name ?? "";
    const visitCount = new Set((todayAtt.data ?? []).map((a) => a.member_id)).size;

    // 만료일 → "N일 남음" / "무기한"(sentinel 2999·9999) / "오늘까지"
    const dLabel = (exp: string | null | undefined) => {
      if (!exp) return "";
      const e = String(exp).slice(0, 10);
      if (e >= "2999-01-01") return "무기한";
      const days = Math.round(
        (Date.parse(`${e}T00:00:00Z`) - Date.parse(`${todayYmd}T00:00:00Z`)) / 86400000
      );
      if (days <= 0) return "오늘까지";
      return `${days}일 남음`;
    };

    const lines: string[] = [];
    for (const m of summary?.memberships ?? []) {
      lines.push(`${m.plan_name}${m.is_paused ? " (정지중)" : ""} ${dLabel(m.expires_at)}`.trim());
    }
    for (const p of summary?.passes ?? []) {
      const total = p.total_sessions ?? 0;
      if (total > 0) {
        lines.push(`${p.lesson_kind} ${total}회 ${p.remaining_sessions}/${total} 남음`);
      } else {
        lines.push(`${p.lesson_kind} ${dLabel(p.expires_at)}`.trim());
      }
    }

    const title = `[${centerName}] ${memberName}님 ${kind === "in" ? "출석!" : "퇴실!"}`;
    const bodyLines = [`금일 방문 ${visitCount}명`, ...lines.slice(0, 5)];
    const body = bodyLines.join("\n");

    for (const cmId of onIds) {
      await notifyStaffMember({
        centerId,
        centerMemberId: cmId,
        type: "member_attendance",
        title,
        body,
        data: { kind: "member_attendance", direction: kind, member_id: String(memberId) },
      }).catch(() => {});
    }
  } catch (e) {
    console.error("[crm-staff-notify] attendance error", e);
  }
}
