import { supabase } from "./supabase";
import { buildAttendanceVoiceMessages } from "./crm-attendance-voice";

export interface CheckinMember {
  id: number;
  name: string;
  phone: string | null;
  birth: string | null;
}

/** 1일 1회 입장 상품인데 같은 날 또 들어왔을 때 안내 문구 */
export const DAILY_ONCE_MESSAGE = "1일 1회 입장 가능한 상품입니다.";

// 출석포인트 적립 대상 source (회원 자가 체크인만). 직원 수동(manual)은 제외.
const MILEAGE_AWARD_SOURCES = new Set([
  "touch_face",
  "touch_number",
  "touch",
  "kiosk",
  "app", // 회원앱 QR 출석도 출석 마일리지 적립 대상
]);

/**
 * 이 회원이 '1일 1회 입장' 제한 대상인지 (상품관리의 하루 출석 가능 횟수 기준).
 *
 * 발급 레코드에는 이 설정이 복사돼 있지 않아 **상품명으로 매칭**한다
 * (회원권=plan_name, 수강권=lesson_kind ↔ crm_products.name).
 * 보유 상품 중 '무제한(0)' 이 하나라도 있으면 제한하지 않는다. 매칭되는 상품이 없으면
 * 기본값(1회)을 따른다 — 상품관리 기본이 1회이기 때문.
 */
export async function isDailyOnceMember(centerId: number, memberId: number): Promise<boolean> {
  const ymd = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const [{ data: memberships }, { data: passes }, { data: products }] = await Promise.all([
    supabase
      .from("crm_memberships")
      .select("plan_name")
      .eq("center_id", centerId)
      .eq("member_id", memberId)
      .eq("status", "valid")
      .eq("is_paused", false)
      .gte("expires_at", ymd)
      .or(`start_date.lte.${ymd},start_date.is.null`),
    supabase
      .from("crm_passes")
      .select("lesson_kind")
      .eq("center_id", centerId)
      .eq("member_id", memberId)
      .eq("status", "valid")
      .eq("is_paused", false)
      .gte("expires_at", ymd)
      .or(`start_date.lte.${ymd},start_date.is.null`),
    supabase
      .from("crm_products")
      .select("name, daily_check_in_limit")
      .eq("center_id", centerId)
      .eq("status", "active"),
  ]);

  // 상품명 정규화 — 발급 시 "(10회)" 같은 꼬리표가 붙는다
  const norm = (v: string | null | undefined) =>
    (v ?? "").replace(/\s*\(\d+\s*회\)\s*$/, "").replace(/\s+/g, "").trim();
  const limitByName = new Map<string, number>();
  for (const pr of (products ?? []) as { name: string; daily_check_in_limit: number | null }[]) {
    limitByName.set(norm(pr.name), Number(pr.daily_check_in_limit ?? 1));
  }

  const heldNames = [
    ...((memberships ?? []) as { plan_name: string }[]).map((m) => norm(m.plan_name)),
    ...((passes ?? []) as { lesson_kind: string }[]).map((p) => norm(p.lesson_kind)),
  ];
  if (heldNames.length === 0) return false; // 유효 상품이 없으면 이 판정에 걸지 않는다

  // 무제한(0) 상품을 하나라도 들고 있으면 제한 없음
  for (const n of heldNames) {
    if (limitByName.get(n) === 0) return false;
  }
  return true;
}

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
  // 중복 차단(재입장) 시간: 얼굴 출석은 지나가다 재인식되기 쉬워 2시간 고정.
  // 그 외(번호/수동)는 터치출석 설정 entry_reentry_minutes 값 사용(미설정 기본 5분).
  let reentryMin = 5;
  try {
    const { data: st } = await supabase
      .from("crm_touch_attendance_settings")
      .select("entry_reentry_minutes")
      .eq("center_id", centerId)
      .maybeSingle();
    const v = Number((st as { entry_reentry_minutes?: number } | null)?.entry_reentry_minutes ?? 0);
    if (v > 0) reentryMin = v;
  } catch {
    /* 설정 조회 실패 시 기본 5분 */
  }
  // '1일 1회 입장' 상품 회원은 2시간 안에 다시 찍으면 '이미 출석하셨습니다'(중복)로 본다.
  const dailyOnce = await isDailyOnceMember(centerId, member.id);
  const dedupMinutes = source === "touch_face" ? 120 : dailyOnce ? Math.max(reentryMin, 120) : reentryMin;
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
    // 만료(사용 가능한 회원권 없음) 회원은 반복 출석해도 매번 만료 안내 음성 재생.
    // 일반 회원은 기존대로 '이미 출석하셨습니다'만.
    let dupMessage = "이미 출석하셨습니다.";
    let dupVoice: string[] = [];
    try {
      const v = await buildAttendanceVoiceMessages(centerId, member);
      if (v.expired && v.messages.length > 0) {
        dupVoice = v.messages;
        dupMessage = v.messages[0];
      }
    } catch {
      /* 음성 계산 실패해도 중복 응답은 유지 */
    }
    return {
      ok: true as const,
      duplicate: true,
      member,
      attendance: recent[0],
      message: dupMessage,
      voice_messages: dupVoice,
    };
  }

  // 오늘(KST) 이미 출석한 적이 있는지 — 1일 1회 상품 회원의 재입장 경고 판정용
  let attendedEarlierToday = false;
  if (dailyOnce) {
    const ymdNow = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const dayStart = new Date(`${ymdNow}T00:00:00+09:00`).toISOString();
    const { data: todayRows } = await supabase
      .from("crm_attendances")
      .select("id")
      .eq("center_id", centerId)
      .eq("member_id", member.id)
      .gte("checked_in_at", dayStart)
      .limit(1);
    attendedEarlierToday = (todayRows ?? []).length > 0;
  }

  const { data: created, error } = await supabase
    .from("crm_attendances")
    .insert({ center_id: centerId, member_id: member.id, source })
    .select("id, checked_in_at")
    .single();

  if (error || !created) {
    return { error: "출석 실패", detail: error?.message, status: 500 as const };
  }

  // 마지막 출석일 스냅샷 갱신(KST). 대시보드·자동알림 등 이 컬럼을 읽는 곳이 최신값을 쓰도록.
  try {
    const todayKst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    await supabase
      .from("crm_members")
      .update({ last_attended_at: todayKst } as never)
      .eq("id", member.id)
      .eq("center_id", centerId);
  } catch {
    /* 스냅샷 갱신 실패해도 체크인 자체는 성공 처리 */
  }

  const mileageAwarded = MILEAGE_AWARD_SOURCES.has(source)
    ? await awardAttendanceMileage(centerId, member.id, created.id)
    : 0;

  // 1일 1회 상품인데 오늘 두 번째 이상(2시간 초과) → 기록은 남기고 경고음 + 안내
  const dailyLimitWarn = dailyOnce && attendedEarlierToday;

  let voiceMessages: string[] = [];
  try {
    const v = await buildAttendanceVoiceMessages(centerId, member);
    if (dailyLimitWarn) {
      voiceMessages = [DAILY_ONCE_MESSAGE];
    } else {
      // 🚨 예전에는 유효 회원에게 v.greeting(환영 인사)만 재생했는데, 그 때문에
      //    '시작 예정일' · 만료 임박 · 미수금 · 생일 안내가 전부 버려졌다.
      //    '출석 포인트가 적립되었습니다' 멘트는 터치출석 설정(msg_active_entry)을 끄면
      //    애초에 생성되지 않으므로, 여기서는 만들어진 안내를 그대로 재생한다.
      voiceMessages = v.messages;
    }
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
    /** '1일 1회 입장' 상품인데 같은 날 또 들어옴 → 화면·경고음으로 알린다 */
    daily_limit_warn: dailyLimitWarn,
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
        // attendance_no = 회원이 터치출석에서 누르는 번호. 확인창에 '회원번호' 로 표시한다.
        .select("mileage, attendance_no")
        .eq("center_id", centerId)
        .eq("id", memberId)
        .maybeSingle(),
      supabase
        .from("crm_memberships")
        .select("id, plan_name, expires_at, start_date, is_paused")
        .eq("center_id", centerId)
        .eq("member_id", memberId)
        .eq("status", "valid")
        .gte("expires_at", todayYmd),
      supabase
        .from("crm_passes")
        .select("id, lesson_kind, remaining_sessions, total_sessions, expires_at, start_date, is_paused")
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

  // 출석시작일 전 판정: 유효(미만료) 이용권 중 이미 시작한 것은 없고, 시작일이 미래인 것만 있을 때.
  //  → "아직 출석시작일이 아닙니다" 안내. (start_date 없으면 즉시 시작으로 간주)
  const startable = [
    ...(membershipsRes.data ?? []).map((m) => (m as { start_date?: string | null }).start_date),
    ...(passesRes.data ?? []).map((p) => (p as { start_date?: string | null }).start_date),
  ];
  const hasStarted = startable.some((sd) => !sd || sd <= todayYmd);
  const hasFutureStart = startable.some((sd) => sd && sd > todayYmd);
  const notStarted = !hasStarted && hasFutureStart;

  return {
    mileage: memberRow.data?.mileage ?? 0,
    attendance_no: memberRow.data?.attendance_no ?? null,
    coupon_count: 0,
    can_enter: canEnter,
    not_started: notStarted,
    memberships,
    passes,
    rentals,
    lockers,
    week_present: weekPresent,
    week_start_ymd: weekStartYmd,
  };
}

/**
 * 이 회원이 출석 시 적립되는 출석포인트 '적립 가능액'(일일 중복과 무관, 상품 설정 기준).
 * 유효·미정지 회원권/수강권의 attendance_mileage_earn 중 최대값. 0이면 적립 없는 회원.
 */
export async function attendanceEarnAmount(centerId: number, memberId: number): Promise<number> {
  const ymd = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const [{ data: memberships }, { data: passes }] = await Promise.all([
    supabase
      .from("crm_memberships")
      .select("attendance_mileage_earn")
      .eq("center_id", centerId)
      .eq("member_id", memberId)
      .eq("status", "valid")
      .eq("is_paused", false)
      .gte("expires_at", ymd)
      .or(`start_date.lte.${ymd},start_date.is.null`),
    supabase
      .from("crm_passes")
      .select("attendance_mileage_earn")
      .eq("center_id", centerId)
      .eq("member_id", memberId)
      .eq("status", "valid")
      .eq("is_paused", false)
      .gte("expires_at", ymd)
      .or(`start_date.lte.${ymd},start_date.is.null`),
  ]);
  return Math.max(
    0,
    ...(memberships ?? []).map((m) => Number(m.attendance_mileage_earn) || 0),
    ...(passes ?? []).map((p) => Number(p.attendance_mileage_earn) || 0)
  );
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
      .gte("expires_at", ymd)
      .or(`start_date.lte.${ymd},start_date.is.null`),
    supabase
      .from("crm_passes")
      .select("attendance_mileage_earn")
      .eq("center_id", centerId)
      .eq("member_id", memberId)
      .eq("status", "valid")
      .eq("is_paused", false)
      .gte("expires_at", ymd)
      .or(`start_date.lte.${ymd},start_date.is.null`),
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

/**
 * 키오스크(터치출석) 화면이 폴링해서 'QR(회원앱) 출석'을 감지하기 위한 헬퍼.
 * 회원이 QR을 스캔하면 source='app' 출석 레코드가 생성되는데, 이 출석은 태블릿이 아닌
 * 회원 폰에서 일어나므로 태블릿엔 결과창이 안 뜬다. 태블릿이 이 함수를 폴링해
 * 새 QR 출석(id > since)이 있으면 번호출석과 동일한 결과(summary/voice/member)를 구성해 돌려준다.
 *
 * @param sinceId 클라이언트가 마지막으로 본 출석 id. 이보다 큰 새 출석만 결과 구성.
 *   null/undefined 면 baseline 모드 — latestId 만 반환(결과 미구성).
 */
export async function getLatestQrCheckin(centerId: number, sinceId: number | null) {
  const { data: rows } = await supabase
    .from("crm_attendances")
    .select("id, member_id, checked_in_at, attendance_mileage_awarded")
    .eq("center_id", centerId)
    .eq("source", "app")
    .order("id", { ascending: false })
    .limit(1);
  const row = rows?.[0] as
    | { id: number; member_id: number; checked_in_at: string; attendance_mileage_awarded: number | null }
    | undefined;
  const latestId = row?.id ?? 0;

  // baseline 요청이거나 새 출석 없음 → 결과 미구성
  if (sinceId == null || !row || latestId <= sinceId) {
    return { latestId, checkin: null as null };
  }

  const { data: member } = await supabase
    .from("crm_members")
    .select("id, name, phone, birth")
    .eq("id", row.member_id)
    .eq("center_id", centerId)
    .maybeSingle();
  if (!member) return { latestId, checkin: null as null };

  const summary = await buildCheckinSummary(centerId, member.id);
  let voice_messages: string[] = [];
  try {
    const v = await buildAttendanceVoiceMessages(centerId, member as CheckinMember);
    // 번호 출석과 동일하게 만들어진 안내를 그대로 재생한다(시작 예정·만료 임박·미수금 등).
    // '출석 포인트가 적립되었습니다' 는 터치출석 설정(msg_active_entry)으로 제어.
    voice_messages = v.messages;
  } catch {
    voice_messages = [];
  }

  return {
    latestId,
    checkin: {
      attendance_id: row.id,
      checked_at: row.checked_in_at,
      member: { name: member.name, birth: member.birth, phone: member.phone },
      duplicate: false,
      mileage_awarded: Number(row.attendance_mileage_awarded) || 0,
      voice_messages,
      summary,
    },
  };
}
