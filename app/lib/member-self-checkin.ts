import { after } from "next/server";
import { supabase } from "./supabase";
import { runCheckIn } from "./crm-checkin";
import { notifyCenterStaffAttendance } from "./crm-staff-notify";

/**
 * 회원 '본인' 출석 — 회원앱 QR 출석(source='app')과 블루투스 자동 출석(source='ble') 공용.
 * 호출하는 쪽에서 센터·회원 인증을 끝낸 뒤 부른다.
 * - 그 센터의 활성 회원만
 * - runCheckIn(중복 차단·1일 1회·입장 자격·출석 마일리지)
 * - 새 출석이면 직원 출석 알림(응답 후 처리)
 * 🚨 라우트 핸들러 안에서만 호출(after 사용).
 */
export async function memberSelfCheckIn(centerId: number, memberId: number, source: "app" | "ble") {
  const { data: member } = await supabase
    .from("crm_members")
    .select("id, name, phone, birth")
    .eq("id", memberId)
    .eq("center_id", centerId)
    .eq("status", "active")
    .maybeSingle();
  if (!member) {
    return { error: "회원 정보를 찾을 수 없어요", status: 404 as const };
  }

  const result = await runCheckIn(centerId, member, source);
  if ("error" in result) return result;
  if (!("duplicate" in result && result.duplicate)) {
    const memberName = member.name;
    const mId = member.id;
    after(() => notifyCenterStaffAttendance({ centerId, memberId: mId, memberName, kind: "in" }));
  }
  return result;
}
