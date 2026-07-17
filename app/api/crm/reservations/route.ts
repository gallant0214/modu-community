import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

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
      "id, pass_id, member_id, trainer_member_id, starts_at, ends_at, status, consumed, attended_at"
    )
    .eq("center_id", ctx.centerId)
    .gte("starts_at", startUtc.toISOString())
    .lt("starts_at", endUtc.toISOString())
    .order("starts_at", { ascending: true });

  // 권한:
  //   trainer         → 본인 스케줄만
  //   manager 이상    → 전체, trainer_id 로 특정 강사만 필터 가능
  if (ctx.role === "trainer") {
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

  let canManageAll = ctx.role === "owner" || ctx.role === "admin";
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

  let body: { pass_id?: number; starts_at?: string; ends_at?: string };
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
    .select("id, center_id, member_id, trainer_member_id, remaining_sessions, status, session_minutes")
    .eq("id", passId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!pass) return NextResponse.json({ error: "수강권을 찾을 수 없습니다" }, { status: 404 });
  if (pass.status !== "valid") {
    return NextResponse.json({ error: "사용할 수 없는 수강권입니다" }, { status: 400 });
  }
  if (pass.remaining_sessions <= 0) {
    return NextResponse.json({ error: "잔여 세션이 없습니다" }, { status: 400 });
  }

  // trainer/manager 는 본인 담당 수강권만 (단 can_manage_all_schedules 있으면 예외)
  if (
    !canManageAll &&
    (ctx.role === "trainer" || ctx.role === "manager") &&
    pass.trainer_member_id !== ctx.centerMemberId
  ) {
    return NextResponse.json({ error: "이 수강권의 담당이 아닙니다" }, { status: 403 });
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

  const { data: created, error } = await supabase
    .from("crm_reservations")
    .insert({
      center_id: ctx.centerId,
      pass_id: passId,
      member_id: pass.member_id,
      trainer_member_id: pass.trainer_member_id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAtIso,
      status: "booked",
      consumed: false,
      created_by_uid: ctx.uid,
    })
    .select("id")
    .single();

  if (error || !created) {
    return NextResponse.json({ error: "예약 생성 실패", detail: error?.message }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    reservationId: created.id,
    ends_at: endsAtIso,
    session_minutes: sessionMinutes,
  });
}
