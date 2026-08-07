import { NextResponse, after } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { loadPermissionsForContext } from "@/app/lib/crm-permissions";
import { sendPushToMember, formatKstSlot } from "@/app/lib/member-notify";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/reservations?date=YYYY-MM-DD
 *   또는 ?from=YYYY-MM-DD&to=YYYY-MM-DD (반열린 구간 [from, to])
 *
 * KST 기준. from 만 있고 to 없으면 1일 범위, to 만 있으면 today부터.
 * trainer/manager 는 본인 컬럼만.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const trainerParam = url.searchParams.get("trainer_id");

  let startUtc: Date;
  let endUtc: Date;
  if (from || to) {
    const f = from || new Date().toISOString().slice(0, 10);
    const t = to || f;
    startUtc = new Date(`${f}T00:00:00+09:00`);
    endUtc = new Date(`${t}T00:00:00+09:00`);
    // to 가 inclusive 가 되도록 24시간 추가
    endUtc = new Date(endUtc.getTime() + 24 * 3600 * 1000);
  } else {
    const d = date || new Date().toISOString().slice(0, 10);
    startUtc = new Date(`${d}T00:00:00+09:00`);
    endUtc = new Date(startUtc.getTime() + 24 * 3600 * 1000);
  }

  let query = supabase
    .from("crm_reservations")
    .select(
      "id, pass_id, member_id, trainer_member_id, starts_at, ends_at, status, consumed, attended_at, cancelled_reason, booking_reason, created_by_uid, created_at"
    )
    .eq("center_id", ctx.centerId)
    .gte("starts_at", startUtc.toISOString())
    .lt("starts_at", endUtc.toISOString())
    // 회원 앱 예약요청(requested)/반려(rejected)는 확정 그리드에서 제외 — 승인 대기함은 별도 조회
    .not("status", "in", "(requested,rejected)")
    .order("starts_at", { ascending: true });

  // 권한:
  //   trainer         → 본인 스케줄만
  //   manager 이상    → 전체, trainer_id 로 특정 강사만 필터 가능
  // 참고: 예약은 담당 강사(trainer_member_id) 기준으로만 필터.
  //       creator 기반 필터는 예약이 아니라 이벤트(schedule-events)에서만 의미가 있음.
  // 🔒 기본은 '본인 담당 예약'만. all=1(전체/타강사 조회)은 schedule.view_others 권한자만 허용.
  const allView = url.searchParams.get("all") === "1";
  let canViewAll = false;
  if (allView) {
    canViewAll =
      ctx.role === "owner" ||
      (await loadPermissionsForContext(ctx))["schedule.view_others"] === true;
  }
  if (!canViewAll) {
    query = query.eq("trainer_member_id", ctx.centerMemberId);
  } else if (trainerParam) {
    query = query.eq("trainer_member_id", Number(trainerParam));
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  // 회원 이름 join
  const memberIds = Array.from(new Set((data ?? []).map((r) => r.member_id)));
  const { data: members } = memberIds.length
    ? await supabase.from("crm_members").select("id, name").in("id", memberIds)
    : { data: [] };
  const nameMap = new Map((members ?? []).map((m) => [m.id, m.name]));

  // 담당 강사 이름 + 예약 생성자 이름 (센터 소속 강사 기준 lookup).
  const trainerIds = Array.from(
    new Set((data ?? []).map((r) => r.trainer_member_id).filter((v): v is number => !!v))
  );
  const creatorUids = Array.from(
    new Set((data ?? []).map((r) => r.created_by_uid).filter((v): v is string => !!v))
  );
  const [trainerLookup, creatorLookup] = await Promise.all([
    trainerIds.length
      ? supabase
          .from("crm_center_members")
          .select("id, display_name")
          .eq("center_id", ctx.centerId)
          .in("id", trainerIds)
      : Promise.resolve({ data: [] as { id: number; display_name: string }[] }),
    creatorUids.length
      ? supabase
          .from("crm_center_members")
          .select("firebase_uid, display_name")
          .eq("center_id", ctx.centerId)
          .in("firebase_uid", creatorUids)
      : Promise.resolve({ data: [] as { firebase_uid: string; display_name: string }[] }),
  ]);
  const trainerNameMap = new Map(
    (trainerLookup.data ?? []).map((t) => [t.id, t.display_name])
  );
  const creatorNameMap = new Map(
    (creatorLookup.data ?? []).map((c) => [c.firebase_uid, c.display_name])
  );

  // 수강권 회차 표시: 각 예약이 해당 수강권의 몇 회째인지 + 총 횟수
  // 회차 = 취소되지 않은 예약을 시작시각 순으로 매긴 순번 (노쇼도 차감이므로 포함)
  const passIds = Array.from(
    new Set((data ?? []).map((r) => r.pass_id).filter((v): v is number => !!v))
  );
  const sessionIndexMap = new Map<number, number>(); // reservation id → 회차
  const passTotalMap = new Map<number, number>(); // pass id → total_sessions
  if (passIds.length > 0) {
    const [{ data: passes }, { data: allRes }] = await Promise.all([
      supabase
        .from("crm_passes")
        .select("id, total_sessions")
        .eq("center_id", ctx.centerId)
        .in("id", passIds),
      supabase
        .from("crm_reservations")
        .select("id, pass_id, starts_at, status")
        .eq("center_id", ctx.centerId)
        .in("pass_id", passIds)
        .neq("status", "cancelled")
        .order("starts_at", { ascending: true }),
    ]);
    for (const p of passes ?? []) passTotalMap.set(p.id, p.total_sessions ?? 0);
    const counter = new Map<number, number>();
    for (const r of allRes ?? []) {
      if (!r.pass_id) continue;
      const n = (counter.get(r.pass_id) ?? 0) + 1;
      counter.set(r.pass_id, n);
      sessionIndexMap.set(r.id, n);
    }
  }

  return NextResponse.json({
    reservations: (data ?? []).map((r) => ({
      ...r,
      member_name: nameMap.get(r.member_id) ?? "",
      trainer_name: trainerNameMap.get(r.trainer_member_id) ?? null,
      created_by_name: r.created_by_uid ? creatorNameMap.get(r.created_by_uid) ?? null : null,
      session_index: r.pass_id ? sessionIndexMap.get(r.id) ?? null : null,
      session_total: r.pass_id ? passTotalMap.get(r.pass_id) ?? null : null,
    })),
  });
}

/**
 * POST /api/crm/reservations
 * 예약 생성.
 *
 * body: { pass_id, starts_at(ISO), ends_at(ISO) }
 *
 * 잔여 0인 수강권엔 못 만듦.
 * trainer 는 can_create_reservation 권한 필요.
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  // 타 강사 스케줄 예약·수정·삭제 권한: 직급권한(schedule.manage_others) + 개별 강사(can_manage_all_schedules) 병합
  const rolePerms = await loadPermissionsForContext(ctx);
  let canManageAll =
    ctx.role === "owner" ||
    ctx.role === "admin" ||
    rolePerms["schedule.manage_others"] === true;
  if (ctx.role === "trainer" || ctx.role === "manager") {
    const { data: perm } = await supabase
      .from("crm_trainer_permissions")
      .select("can_create_reservation, can_manage_all_schedules")
      .eq("center_member_id", ctx.centerMemberId)
      .maybeSingle();
    if (ctx.role === "trainer" && !perm?.can_create_reservation) {
      return NextResponse.json({ error: "예약 생성 권한이 없습니다" }, { status: 403 });
    }
    if (perm?.can_manage_all_schedules) canManageAll = true;
  }

  let body: { pass_id?: number; starts_at?: string; ends_at?: string; trainer_member_id?: number; force?: boolean; booking_reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const passId = Number(body.pass_id);
  if (!passId || !body.starts_at) {
    return NextResponse.json({ error: "필수 항목이 비어있습니다" }, { status: 400 });
  }

  // session_minutes 까지 조회 → 예약 종료 시각 서버측 파생
  const { data: pass } = await supabase
    .from("crm_passes")
    .select("id, center_id, member_id, trainer_member_id, co_trainer_ids, remaining_sessions, total_sessions, status, session_minutes, group_capacity")
    .eq("id", passId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!pass) return NextResponse.json({ error: "수강권을 찾을 수 없습니다" }, { status: 404 });
  if (pass.status !== "valid") {
    return NextResponse.json({ error: "사용할 수 없는 수강권입니다" }, { status: 400 });
  }
  // 기간제(총 세션 0)는 기간 내 횟수 제한 없이 예약 가능 → 잔여/슬롯 검사 건너뜀.
  const isPeriodPass = !pass.total_sessions || pass.total_sessions <= 0;
  if (!isPeriodPass) {
    if (pass.remaining_sessions <= 0) {
      return NextResponse.json({ error: "잔여 세션이 없습니다" }, { status: 400 });
    }
    // 이미 잡힌 예약(취소·거절 제외)이 총 횟수 이상이면 더 예약 불가 → 모든 예약 완료 상태.
    const { count: reservedCount } = await supabase
      .from("crm_reservations")
      .select("id", { count: "exact", head: true })
      .eq("center_id", ctx.centerId)
      .eq("pass_id", passId)
      .not("status", "in", "(cancelled,rejected)");
    if ((reservedCount ?? 0) >= (pass.total_sessions ?? 0)) {
      return NextResponse.json({ error: "이미 모든 예약이 완료된 수강권입니다" }, { status: 400 });
    }
  }

  // 담당 강사 = 주강사 + 추가강사(co_trainer_ids). 이들만 예약 가능
  const coTrainerIds = Array.isArray(pass.co_trainer_ids)
    ? (pass.co_trainer_ids as number[])
    : [];
  const isAssignedTrainer =
    ctx.centerMemberId != null &&
    (pass.trainer_member_id === ctx.centerMemberId || coTrainerIds.includes(ctx.centerMemberId));

  // trainer/manager 는 본인이 (주강사 또는 추가강사로) 지정된 수강권만
  // (can_manage_all_schedules 있으면 예외)
  if (!canManageAll && (ctx.role === "trainer" || ctx.role === "manager") && !isAssignedTrainer) {
    return NextResponse.json({ error: "이 수강권의 담당이 아닙니다" }, { status: 403 });
  }

  // 예약을 실제로 진행하는 강사에 귀속:
  //   1) 클라이언트가 body.trainer_member_id 를 명시 → 유효성 확인 후 그 값 사용
  //      - 그 강사가 pass 의 주강사/추가강사 이거나
  //      - 요청자가 canManageAll(대표/관리자·직급권한·can_manage_all_schedules) 이면 허용
  //   2) 미명시면 기존 fallback: 예약자가 지정 강사면 본인, 아니면 주강사
  const requestedTrainer =
    body.trainer_member_id && Number.isFinite(Number(body.trainer_member_id))
      ? Number(body.trainer_member_id)
      : null;
  const requestedInAssigned =
    requestedTrainer != null &&
    (requestedTrainer === pass.trainer_member_id || coTrainerIds.includes(requestedTrainer));
  let reservationTrainerId: number;
  if (requestedTrainer != null && (requestedInAssigned || canManageAll)) {
    reservationTrainerId = requestedTrainer;
  } else {
    reservationTrainerId = isAssignedTrainer
      ? (ctx.centerMemberId as number)
      : pass.trainer_member_id;
  }

  // 종료 시각: 수강권 session_minutes 로 서버측 파생 (웹·앱 공통 규칙).
  // 유효값 없으면 클라이언트 ends_at 폴백 → 그것도 없으면 50분 기본
  const sessionMinutes = pass.session_minutes && pass.session_minutes > 0 ? pass.session_minutes : null;
  const startsAt = new Date(body.starts_at);
  if (Number.isNaN(startsAt.getTime())) {
    return NextResponse.json({ error: "시작 시각 형식 오류" }, { status: 400 });
  }
  let endsAtIso: string;
  if (sessionMinutes) {
    endsAtIso = new Date(startsAt.getTime() + sessionMinutes * 60 * 1000).toISOString();
  } else if (body.ends_at) {
    const e = new Date(body.ends_at);
    if (Number.isNaN(e.getTime()) || e.getTime() <= startsAt.getTime()) {
      return NextResponse.json({ error: "종료 시각 형식 오류" }, { status: 400 });
    }
    endsAtIso = e.toISOString();
  } else {
    endsAtIso = new Date(startsAt.getTime() + 50 * 60 * 1000).toISOString();
  }

  // 시간 겹침 방지: 같은 강사가 겹치는 시간대에 이미 예약이 있으면 막는다(경고).
  // 단 2:1 등 그룹 수업(group_capacity>=2)은 정원까지 동시 예약 허용.
  const groupCap = Math.max(1, Number((pass as { group_capacity?: number }).group_capacity ?? 1) || 1);
  const startIso = startsAt.toISOString();
  const { data: overlaps } = await supabase
    .from("crm_reservations")
    .select("id")
    .eq("center_id", ctx.centerId)
    .eq("trainer_member_id", reservationTrainerId)
    .not("status", "in", "(cancelled,rejected)")
    .lt("starts_at", endsAtIso)
    .gt("ends_at", startIso);
  const overlapCount = (overlaps ?? []).length;
  // force=true 면 강사가 중복 예약을 명시적으로 허용한 것(앱에서 "중복 예약하시겠습니까?" 확인 후)
  if (!body.force && overlapCount > 0) {
    if (groupCap < 2) {
      return NextResponse.json(
        { error: "이미 예약된 시간이에요. 다른 시간을 선택해 주세요." },
        { status: 409 }
      );
    }
    if (overlapCount >= groupCap) {
      return NextResponse.json(
        { error: `그룹 수업 정원(${groupCap}명)이 찼어요.` },
        { status: 409 }
      );
    }
  }

  const { data: created, error } = await supabase
    .from("crm_reservations")
    .insert({
      center_id: ctx.centerId,
      pass_id: passId,
      member_id: pass.member_id,
      trainer_member_id: reservationTrainerId,
      starts_at: startsAt.toISOString(),
      ends_at: endsAtIso,
      status: "booked",
      consumed: false,
      created_by_uid: ctx.uid,
      booking_reason: body.booking_reason?.trim() || null,
    })
    .select("id")
    .single();

  if (error || !created) {
    return NextResponse.json({ error: "예약 생성 실패", detail: error?.message }, { status: 500 });
  }

  // 회원 알림: 강사가 수업을 예약함
  after(async () => {
    await sendPushToMember(
      pass.member_id,
      "reservation_booked",
      "수업이 예약됐어요 ✅",
      `${formatKstSlot(startsAt.toISOString())} 수업이 예약됐어요`,
      { reservationId: String(created.id) }
    ).catch(() => {});
  });

  return NextResponse.json({
    ok: true,
    reservationId: created.id,
    ends_at: endsAtIso,
    session_minutes: sessionMinutes,
  });
}
