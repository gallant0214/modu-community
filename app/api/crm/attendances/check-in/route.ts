import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { buildAttendanceVoiceMessages } from "@/app/lib/crm-attendance-voice";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/attendances/check-in
 * body: { token?: string, member_id?: number, source?: 'kiosk'|'manual' }
 *
 * - token 으로 회원 찾기 (QR 스캔)
 * - 또는 member_id 직접 (manual)
 * - 중복 체크: 5분 이내 동일 회원 재체크인 차단 (실수 방지)
 *
 * 응답: 성공 시 { member, attendance, recent_other_attendances }
 *       실패 시 { error }
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  let body: { token?: string; member_id?: number; source?: string; center_id?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  // 다른 센터 회원(개인 CRM 통합 목록 등)을 출석 처리할 때 center_id 로 대상 센터 지정.
  // 요청자가 그 센터의 활성 멤버여야 허용. 미지정/무권한이면 현재 컨텍스트 센터.
  let targetCenterId = ctx.centerId;
  const centerParam = Number(body.center_id) || 0;
  if (centerParam && centerParam !== ctx.centerId) {
    const { data: om } = await supabase
      .from("crm_center_members")
      .select("id")
      .eq("firebase_uid", ctx.uid)
      .eq("center_id", centerParam)
      .eq("status", "active")
      .maybeSingle();
    if (om) targetCenterId = centerParam;
  }

  let member: { id: number; name: string; phone: string | null; birth: string | null } | null = null;

  if (body.token) {
    const { data } = await supabase
      .from("crm_members")
      .select("id, name, phone, birth")
      .eq("center_id", targetCenterId)
      .eq("checkin_token", body.token.trim())
      .eq("status", "active")
      .maybeSingle();
    member = data;
  } else if (body.member_id) {
    const { data } = await supabase
      .from("crm_members")
      .select("id, name, phone, birth")
      .eq("center_id", targetCenterId)
      .eq("id", body.member_id)
      .eq("status", "active")
      .maybeSingle();
    member = data;
  }

  if (!member) {
    return NextResponse.json({ error: "회원을 찾을 수 없습니다" }, { status: 404 });
  }

  // 중복 차단: 최근 5분 이내 같은 회원 체크인이 있으면 건너뜀
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from("crm_attendances")
    .select("id, checked_in_at")
    .eq("center_id", targetCenterId)
    .eq("member_id", member.id)
    .gte("checked_in_at", cutoff)
    .order("checked_in_at", { ascending: false })
    .limit(1);

  if (recent && recent.length > 0) {
    // 중복 체크인도 음성 안내는 재생하지 않음 (같은 회원 여러 번 재생 방지)
    return NextResponse.json({
      ok: true,
      duplicate: true,
      member,
      attendance: recent[0],
      message: "이미 최근 5분 안에 체크인 기록이 있어요.",
      voice_messages: [],
    });
  }

  const source = (() => {
    switch (body.source) {
      case "manual":
        return "manual";
      case "touch_face":
        return "touch_face"; // 터치출석 · 얼굴 인식
      case "touch_number":
        return "touch_number"; // 터치출석 · 출석번호 입력
      case "touch":
        return "touch"; // legacy
      default:
        return "kiosk";
    }
  })();

  const { data: created, error } = await supabase
    .from("crm_attendances")
    .insert({
      center_id: targetCenterId,
      member_id: member.id,
      source,
    })
    .select("id, checked_in_at")
    .single();

  if (error || !created) {
    return NextResponse.json({ error: "출석 실패", detail: error?.message }, { status: 500 });
  }

  // 출석 마일리지 적립 (하루 1회). 하루에 여러 번 방문해도 한 번만 적립.
  const mileageAwarded = await awardAttendanceMileage(targetCenterId, member.id, created.id);

  // 음성 안내 메세지 계산 (센터가 규칙을 등록해뒀을 때만 반환).
  // 실패해도 체크인 자체는 성공으로 응답해야 하므로 try/catch.
  let voiceMessages: string[] = [];
  try {
    voiceMessages = await buildAttendanceVoiceMessages(targetCenterId, member);
  } catch {
    voiceMessages = [];
  }

  // 결과 화면용 요약(이용권/락커/이번 주 출석/마일리지)
  const summary = await buildCheckinSummary(targetCenterId, member.id);

  return NextResponse.json({
    ok: true,
    member,
    attendance: created,
    mileage_awarded: mileageAwarded,
    voice_messages: voiceMessages,
    summary,
  });
}

/**
 * 체크인 결과 화면에 노출할 회원 요약.
 * - mileage / coupon_count
 * - active_memberships[]   : 유효 회원권 (이름·만료일)
 * - active_passes[]        : 유효 수강권 (수업명·잔여·총·만료)
 * - active_rentals[]       : 유효 대여권(운동복 등)
 * - lockers[]              : 배정된 락커
 * - week_attendance[7]     : KST 이번 주(일~토) 요일별 출석 여부
 * - can_enter              : 하나라도 유효 이용권/락커 있으면 true
 */
async function buildCheckinSummary(centerId: number, memberId: number) {
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const todayYmd = kstNow.toISOString().slice(0, 10);
  // 이번 주(일요일 시작) 시작 KST → UTC
  const dow = kstNow.getUTCDay(); // 0=일
  const weekStartKst = new Date(kstNow);
  weekStartKst.setUTCDate(weekStartKst.getUTCDate() - dow);
  const weekStartYmd = weekStartKst.toISOString().slice(0, 10);
  const weekStartUtc = new Date(`${weekStartYmd}T00:00:00+09:00`);
  const weekEndUtc = new Date(weekStartUtc.getTime() + 7 * 24 * 3600 * 1000);

  const [
    memberRow,
    membershipsRes,
    passesRes,
    rentalsRes,
    lockersRes,
    weekAttendRes,
  ] = await Promise.all([
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

  // 이번 주 요일별 출석 여부 (일=0 ~ 토=6)
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
    coupon_count: 0, // 쿠폰 미구현 상태
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
 * - 오늘 이미 적립 이력이 있으면 0 반환(중복 방지).
 * - 없으면 회원의 유효 회원권 중 최대 attendance_mileage_earn 만큼 적립.
 * 반환: 이번에 적립된 금액(P).
 */
async function awardAttendanceMileage(
  centerId: number,
  memberId: number,
  attendanceId: number
): Promise<number> {
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const ymd = kstNow.toISOString().slice(0, 10);
  const startUtc = new Date(`${ymd}T00:00:00+09:00`);
  const endUtc = new Date(startUtc.getTime() + 24 * 3600 * 1000);

  // 오늘 이미 적립됐는지 확인 (방금 만든 기록은 awarded=0 이라 매칭 안 됨)
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

  // 유효 회원권 + 유효 수강권 중 출석 적립 마일리지 최댓값
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

  // 이 출석 기록에 적립 표시 + 회원 마일리지 잔고 증가
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
