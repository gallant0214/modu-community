import { NextResponse } from "next/server";
import { after } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";
import { notifyCenterStaffNewRequest } from "@/app/lib/member-notify";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/member-app/reservations/request
 * body: { centerId, pass_id, starts_at(ISO), booking_reason? }
 *
 * 회원 셀프 예약 "요청" — status='requested', source='member_app'.
 * 트레이너/관리자 승인 시 booked 로 확정된다.
 *
 * 검증: 예약 신청 활성 / 내 수강권 / 잔여·기간 / 예약가능 기간 / 시간충돌(그룹은 정원까지 허용).
 */
export async function POST(request: Request) {
  let body: { centerId?: number; pass_id?: number; starts_at?: string; booking_reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const ctx = await requireMemberForCenter(request, Number(body.centerId));
  if (isMemberError(ctx)) return ctx;

  const passId = Number(body.pass_id);
  if (!passId || !body.starts_at) {
    return NextResponse.json({ error: "수강권과 예약 시간을 선택해주세요" }, { status: 400 });
  }
  const startsAt = new Date(body.starts_at);
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
  const now = Date.now();
  if (startsAt.getTime() < now) {
    return NextResponse.json({ error: "지난 시간은 예약할 수 없어요" }, { status: 400 });
  }
  if (startsAt.getTime() > now + horizonDays * 24 * 3600 * 1000) {
    return NextResponse.json({ error: `예약은 ${horizonDays}일 이내만 가능해요` }, { status: 400 });
  }

  // 내 수강권
  const { data: pass } = await supabase
    .from("crm_passes")
    .select("id, member_id, trainer_member_id, total_sessions, remaining_sessions, status, session_minutes, group_capacity, expires_at")
    .eq("id", passId)
    .eq("center_id", ctx.centerId)
    .eq("member_id", ctx.memberId)
    .maybeSingle();
  if (!pass) return NextResponse.json({ error: "수강권을 찾을 수 없습니다" }, { status: 404 });
  if (pass.status !== "valid") {
    return NextResponse.json({ error: "사용할 수 없는 수강권입니다" }, { status: 400 });
  }
  // 유효기간 만료 검사: 수업일(예약 시각, KST)이 수강권 만료일 이후면 잔여 횟수가 있어도 예약 불가.
  // (무기한 9999-12-31 은 항상 통과)
  const startsKstYmd = new Date(startsAt.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  if (pass.expires_at && pass.expires_at !== "9999-12-31" && startsKstYmd > pass.expires_at) {
    return NextResponse.json({ error: "유효기간이 만료된 수강권입니다." }, { status: 400 });
  }

  const isPeriod = (pass.total_sessions ?? 0) <= 0;
  const capacity = pass.group_capacity && pass.group_capacity > 0 ? pass.group_capacity : 1;

  // 횟수제: 잔여 + 예약된 회차가 총 회차 넘지 않게
  if (!isPeriod) {
    if ((pass.remaining_sessions ?? 0) <= 0) {
      return NextResponse.json({ error: "잔여 세션이 없어요" }, { status: 400 });
    }
    const { count: reserved } = await supabase
      .from("crm_reservations")
      .select("id", { count: "exact", head: true })
      .eq("center_id", ctx.centerId)
      .eq("pass_id", passId)
      .not("status", "in", "(cancelled,rejected)");
    if ((reserved ?? 0) >= (pass.total_sessions ?? 0)) {
      return NextResponse.json({ error: "이미 모든 회차를 예약했어요" }, { status: 400 });
    }
  }

  const sessionMinutes = pass.session_minutes && pass.session_minutes > 0 ? pass.session_minutes : 50;
  const endsAt = new Date(startsAt.getTime() + sessionMinutes * 60 * 1000);
  const trainerId = pass.trainer_member_id;

  // 겹치는 예약 조회 (요청/확정/출석)
  const { data: overlaps } = await supabase
    .from("crm_reservations")
    .select("id, member_id, starts_at")
    .eq("center_id", ctx.centerId)
    .eq("trainer_member_id", trainerId)
    .in("status", ["requested", "booked", "attended"])
    .lt("starts_at", endsAt.toISOString())
    .gt("ends_at", startsAt.toISOString());
  const ov = overlaps ?? [];

  // 이미 같은 시간대에 내 예약이 있으면 중복 방지
  if (ov.some((o) => o.member_id === ctx.memberId)) {
    return NextResponse.json({ error: "이미 해당 시간에 예약이 있어요" }, { status: 409 });
  }
  // 정원: 개인수업(1) 이면 겹치면 불가, 그룹이면 정원 미만일 때만
  if (ov.length >= capacity) {
    return NextResponse.json({ error: "이미 예약이 찬 시간이에요. 다른 시간을 선택해주세요." }, { status: 409 });
  }

  const reason = (body.booking_reason ?? "").trim().slice(0, 200) || null;

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
      booking_reason: reason,
      created_by_uid: ctx.uid,
    } as never)
    .select("id")
    .single();
  if (error || !created) {
    return NextResponse.json({ error: "예약 요청 실패", detail: error?.message }, { status: 500 });
  }

  after(async () => {
    await notifyCenterStaffNewRequest({
      centerId: ctx.centerId,
      trainerMemberId: trainerId,
      memberName: ctx.name,
      startsAt: startsAt.toISOString(),
      reservationId: created.id,
    }).catch(() => {});
  });

  return NextResponse.json({ ok: true, reservationId: created.id });
}
