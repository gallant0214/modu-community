import { NextResponse } from "next/server";
import { after } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberContext, isMemberError } from "@/app/lib/member-auth";
import { notifyCenterStaffNewRequest } from "@/app/lib/member-notify";

export const dynamic = "force-dynamic";

/**
 * GET /api/member/reservations
 *   기본: 오늘 0시(KST)부터 앞으로의 내 예약 (예정된 수업)
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD : 기간 지정(과거 내역 조회용)
 *
 * 트레이너 이름·수강권 회차 함께 반환.
 */
export async function GET(request: Request) {
  const ctx = await requireMemberContext(request);
  if (isMemberError(ctx)) return ctx;

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  let query = supabase
    .from("crm_reservations")
    .select(
      "id, pass_id, trainer_member_id, starts_at, ends_at, status, source, requested_at, approved_at"
    )
    .eq("center_id", ctx.centerId)
    .eq("member_id", ctx.memberId);

  if (from || to) {
    const f = from || new Date().toISOString().slice(0, 10);
    const t = to || f;
    const startUtc = new Date(`${f}T00:00:00+09:00`);
    const endUtc = new Date(new Date(`${t}T00:00:00+09:00`).getTime() + 24 * 3600 * 1000);
    query = query
      .gte("starts_at", startUtc.toISOString())
      .lt("starts_at", endUtc.toISOString())
      .order("starts_at", { ascending: false });
  } else {
    // 오늘 0시(KST) 이후 = 예정된 수업
    const todayKst = new Date().toISOString().slice(0, 10);
    const startUtc = new Date(`${todayKst}T00:00:00+09:00`);
    query = query
      .gte("starts_at", startUtc.toISOString())
      .order("starts_at", { ascending: true });
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  // 트레이너 이름
  const trainerIds = Array.from(new Set((data ?? []).map((r) => r.trainer_member_id)));
  const nameMap = new Map<number, string>();
  if (trainerIds.length > 0) {
    const { data: staff } = await supabase
      .from("crm_center_members")
      .select("id, display_name")
      .in("id", trainerIds);
    for (const s of staff ?? []) nameMap.set(s.id, s.display_name || "트레이너");
  }

  return NextResponse.json({
    reservations: (data ?? []).map((r) => ({
      id: r.id,
      passId: r.pass_id,
      trainerId: r.trainer_member_id,
      trainerName: nameMap.get(r.trainer_member_id) ?? "트레이너",
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      status: r.status,
      source: r.source,
    })),
  });
}

/**
 * POST /api/member/reservations
 * 회원 셀프 예약 "요청" — status='requested' 로 생성(트레이너 승인 대기).
 *
 * body: { passId, startsAt(ISO) }
 *
 * 검증: 예약 신청 활성 / 내 유효 수강권 / 잔여 / 예약가능 기간 / 트레이너 시간 충돌.
 * 종료시각은 수강권 session_minutes 로 서버측 파생(웹 규칙과 동일).
 */
export async function POST(request: Request) {
  const ctx = await requireMemberContext(request);
  if (isMemberError(ctx)) return ctx;

  let body: { passId?: number; startsAt?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const passId = Number(body.passId);
  if (!passId || !body.startsAt) {
    return NextResponse.json({ error: "수강권과 예약 시간을 선택해주세요" }, { status: 400 });
  }
  const startsAt = new Date(body.startsAt);
  if (Number.isNaN(startsAt.getTime())) {
    return NextResponse.json({ error: "시작 시각 형식 오류" }, { status: 400 });
  }

  // 예약 설정
  const { data: settings } = await supabase
    .from("crm_center_settings")
    .select("booking_enabled, booking_horizon_days")
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (settings && settings.booking_enabled === false) {
    return NextResponse.json({ error: "지금은 예약 신청을 받고 있지 않아요" }, { status: 403 });
  }
  const horizonDays = settings?.booking_horizon_days ?? 30;

  // 과거/기간초과 방지
  const now = Date.now();
  if (startsAt.getTime() < now) {
    return NextResponse.json({ error: "지난 시간은 예약할 수 없어요" }, { status: 400 });
  }
  if (startsAt.getTime() > now + horizonDays * 24 * 3600 * 1000) {
    return NextResponse.json({ error: `예약은 ${horizonDays}일 이내만 가능해요` }, { status: 400 });
  }

  // 내 수강권 확인
  const { data: pass } = await supabase
    .from("crm_passes")
    .select("id, member_id, trainer_member_id, remaining_sessions, status, session_minutes")
    .eq("id", passId)
    .eq("center_id", ctx.centerId)
    .eq("member_id", ctx.memberId)
    .maybeSingle();
  if (!pass) return NextResponse.json({ error: "수강권을 찾을 수 없습니다" }, { status: 404 });
  if (pass.status !== "valid") {
    return NextResponse.json({ error: "사용할 수 없는 수강권입니다" }, { status: 400 });
  }
  if (pass.remaining_sessions <= 0) {
    return NextResponse.json({ error: "잔여 세션이 없어요" }, { status: 400 });
  }

  const sessionMinutes = pass.session_minutes && pass.session_minutes > 0 ? pass.session_minutes : 50;
  const endsAt = new Date(startsAt.getTime() + sessionMinutes * 60 * 1000);
  const trainerId = pass.trainer_member_id;

  // 트레이너 시간 충돌 (요청/확정/출석 상태와 겹치면 불가)
  const { data: conflicts } = await supabase
    .from("crm_reservations")
    .select("id, starts_at, ends_at")
    .eq("center_id", ctx.centerId)
    .eq("trainer_member_id", trainerId)
    .in("status", ["requested", "booked", "attended"])
    .lt("starts_at", endsAt.toISOString())
    .gt("ends_at", startsAt.toISOString());
  if (conflicts && conflicts.length > 0) {
    return NextResponse.json({ error: "이미 예약된 시간이에요. 다른 시간을 선택해주세요." }, { status: 409 });
  }

  const { data: created, error } = await supabase
    .from("crm_reservations")
    .insert({
      center_id: ctx.centerId,
      pass_id: passId,
      member_id: ctx.memberId,
      trainer_member_id: trainerId,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: "requested",
      consumed: false,
      source: "member_app",
      requested_at: new Date().toISOString(),
      created_by_uid: ctx.uid,
    })
    .select("id")
    .single();

  if (error || !created) {
    return NextResponse.json({ error: "예약 요청 실패", detail: error?.message }, { status: 500 });
  }

  // 트레이너에게 새 예약요청 푸시 (백그라운드)
  after(async () => {
    await notifyCenterStaffNewRequest({
      centerId: ctx.centerId,
      trainerMemberId: trainerId,
      memberName: ctx.name,
      startsAt: startsAt.toISOString(),
    }).catch(() => {});
  });

  return NextResponse.json({ ok: true, reservationId: created.id });
}
