import { supabase } from "./supabase";
import { buildAttendanceVoiceMessages } from "./crm-attendance-voice";

export interface CheckinMember {
  id: number;
  name: string;
  phone: string | null;
  birth: string | null;
}

// 출석포인트 적립 대상 source (회원 자가 체크인만). 직원 수동(manual)은 제외.
const MILEAGE_AWARD_SOURCES = new Set([
  "touch_face",
  "touch_number",
  "touch",
  "kiosk",
]);

/**
 * 회원 체크인 실행(공유). CRM 로그인 라우트 + 공개 키오스크 라우트 공용.
 * - 최근 5분 중복 차단
 * - 출석 기록 insert
 * - 출석 마일리지 적립(터치/얼굴/키오스크만)
 * - 음성 안내 + 결과 요약
 * 반환 객체를 그대로 NextResponse.json 하면 됨(에러면 error/status 포함).
 */
export async function runCheckIn(
  centerId: number,
  member: CheckinMember,
  source: string
) {
  // 중복 차단 시간: 얼굴 출석은 지나가다 재인식되기 쉬워 2시간, 그 외(번호/수동)는 5분.
  const dedupMinutes = source === "touch_face" ? 120 : 5;
  const cutoff = new Date(Date.now() - dedupMinutes * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from("crm_attendances")
    .select("id, checked_in_at")
    .eq("center_id", centerId)
    .eq("member_id", member.id)
    .gte("checked_in_at", cutoff)
    .order("checked_in_at", { ascending: false })
    .limit(1);

  if (recent && recent.length > 0) {
    return {
      ok: true as const,
      duplicate: true,
      member,
      attendance: recent[0],
      message: "이미 출석하셨습니다.",
      voice_messages: [] as string[],
    };
  }

  const { data: created, error } = await supabase
    .from("crm_attendances")
    .insert({ center_id: centerId, member_id: member.id, source })
    .select("id, checked_in_at")
    .single();

  if (error || !created) {
    return { error: "출석 실패", detail: error?.message, status: 500 as const };
  }

  const mileageAwarded = MILEAGE_AWARD_SOURCES.has(source)
    ? await awardAttendanceMileage(centerId, member.id, created.id)
    : 0;

  let voiceMessages: string[] = [];
  try {
    voiceMessages = await buildAttendanceVoiceMessages(centerId, member);
  } catch {
    voiceMessages = [];
  }

  const summary = await buildCheckinSummary(centerId, member.id);

  return {
    ok: true as const,
    member,
    attendance: created,
    mileage_awarded: mileageAwarded,
    voice_messages: voiceMessages,
    summary,
  };
}

/** 체크인 결과 화면 요약(이용권/락커/이번주 출석/마일리지). */
export async function buildCheckinSummary(centerId: number, memberId: number) {
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const todayYmd = kstNow.toISOString().slice(0, 10);
  const dow = kstNow.getUTCDay(); // 0=일
  const weekStartKst = new Date(kstNow);
  weekStartKst.setUTCDate(weekStartKst.getUTCDate() - dow);
  const weekStartYmd = weekStartKst.toISOString().slice(0, 10);
  const weekStartUtc = new Date(`${weekStartYmd}T00:00:00+09:00`);
  const weekEndUtc = new Date(weekStartUtc.getTime() + 7 * 24 * 3600 * 1000);

  const [memberRow, membershipsRes, passesRes, rentalsRes, lockersRes, weekAttendRes] =
    await Promise.all([
      supabase
        .from("crm_members")
        .select("mileage")
        .eq("center_id", centerId)
        .eq("id", memberId)
        .maybeSingle(),
      supabase
        .from("crm_memberships")
        .select("id, plan_name, expires_at, is_paused")
        .eq("center_id", centerId)
        .eq("member_id", memberId)
        .eq("status", "valid")
        .gte("expires_at", todayYmd),
      supabase
        .from("crm_passes")
        .select("id, lesson_kind, remaining_sessions, total_sessions, expires_at, is_paused")
        .eq("center_id", centerId)
        .eq("member_id", memberId)
        .eq("status", "valid")
        .gte("expires_at", todayYmd),
      supabase
        .from("crm_rentals")
        .select("id, item_name, expires_at")
        .eq("center_id", centerId)
        .eq("member_id", memberId)
        .eq("status", "active")
        .gte("expires_at", todayYmd),
      supabase
        .from("crm_lockers")
        .select("id, number, expires_at, zone_id, crm_locker_zones(name)")
        .eq("center_id", centerId)
        .eq("assigned_member_id", memberId),
      supabase
        .from("crm_attendances")
        .select("checked_in_at")
        .eq("center_id", centerId)
        .eq("member_id", memberId)
        .gte("checked_in_at", weekStartUtc.toISOString())
        .lt("checked_in_at", weekEndUtc.toISOString()),
    ]);

  const memberships = (membershipsRes.data ?? []).map((m) => ({
    id: m.id,
    plan_name: m.plan_name,
    expires_at: m.expires_at,
    is_paused: m.is_paused ?? false,
  }));
  const passes = (passesRes.data ?? []).map((p) => ({
    id: p.id,
    lesson_kind: p.lesson_kind,
    remaining_sessions: p.remaining_sessions ?? 0,
    total_sessions: p.total_sessions ?? 0,
    expires_at: p.expires_at,
    is_paused: p.is_paused ?? false,
  }));
  const rentals = (rentalsRes.data ?? []).map((r) => ({
    id: r.id,
    item_name: r.item_name,
    expires_at: r.expires_at,
  }));
  const lockers = (lockersRes.data ?? []).map((l) => {
    const zn = Array.isArray(l.crm_locker_zones)
      ? l.crm_locker_zones[0]
      : (l.crm_locker_zones as { name?: string } | null);
    return {
      id: l.id,
      number: l.number,
      expires_at: l.expires_at,
      zone_name: zn?.name ?? "",
    };
  });

  const weekPresent = [false, false, false, false, false, false, false];
  for (const a of weekAttendRes.data ?? []) {
    const dt = new Date(new Date(a.checked_in_at).getTime() + 9 * 3600 * 1000);
    weekPresent[dt.getUTCDay()] = true;
  }

  const canEnter =
    memberships.some((m) => !m.is_paused) ||
    passes.some((p) => !p.is_paused && p.remaining_sessions > 0) ||
    rentals.length > 0 ||
    lockers.length > 0;

  return {
    mileage: memberRow.data?.mileage ?? 0,
    coupon_count: 0,
    can_enter: canEnter,
    memberships,
    passes,
    rentals,
    lockers,
    week_present: weekPresent,
    week_start_ymd: weekStartYmd,
  };
}

/**
 * 출석 시 마일리지 적립 — KST 기준 하루 1회.
 * 오늘 이미 적립 이력 있으면 0. 없으면 유효 회원권/수강권 중 최대 적립액.
 */
export async function awardAttendanceMileage(
  centerId: number,
  memberId: number,
  attendanceId: number
): Promise<number> {
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const ymd = kstNow.toISOString().slice(0, 10);
  const startUtc = new Date(`${ymd}T00:00:00+09:00`);
  const endUtc = new Date(startUtc.getTime() + 24 * 3600 * 1000);

  const { data: awardedToday } = await supabase
    .from("crm_attendances")
    .select("id")
    .eq("center_id", centerId)
    .eq("member_id", memberId)
    .gte("checked_in_at", startUtc.toISOString())
    .lt("checked_in_at", endUtc.toISOString())
    .gt("attendance_mileage_awarded", 0)
    .limit(1);
  if (awardedToday && awardedToday.length > 0) return 0;

  const [{ data: memberships }, { data: passes }] = await Promise.all([
    supabase
      .from("crm_memberships")
      .select("attendance_mileage_earn")
      .eq("center_id", centerId)
      .eq("member_id", memberId)
      .eq("status", "valid")
      .eq("is_paused", false)
      .gte("expires_at", ymd),
    supabase
      .from("crm_passes")
      .select("attendance_mileage_earn")
      .eq("center_id", centerId)
      .eq("member_id", memberId)
      .eq("status", "valid")
      .eq("is_paused", false)
      .gte("expires_at", ymd),
  ]);

  const amount = Math.max(
    0,
    ...(memberships ?? []).map((m) => Number(m.attendance_mileage_earn) || 0),
    ...(passes ?? []).map((p) => Number(p.attendance_mileage_earn) || 0)
  );
  if (amount <= 0) return 0;

  await supabase
    .from("crm_attendances")
    .update({ attendance_mileage_awarded: amount } as never)
    .eq("id", attendanceId)
    .eq("center_id", centerId);

  const { data: mem } = await supabase
    .from("crm_members")
    .select("mileage")
    .eq("id", memberId)
    .eq("center_id", centerId)
    .maybeSingle();
  const nextMileage = Math.max(0, (mem?.mileage ?? 0) + amount);
  await supabase
    .from("crm_members")
    .update({ mileage: nextMileage } as never)
    .eq("id", memberId)
    .eq("center_id", centerId);

  return amount;
}
