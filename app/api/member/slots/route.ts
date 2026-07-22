import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberContext, isMemberError } from "@/app/lib/member-auth";

export const dynamic = "force-dynamic";

/** "HH:MM[:SS]" → 분 */
function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

/**
 * GET /api/member/slots?passId=&date=YYYY-MM-DD
 * 특정 수강권(담당 트레이너)의 해당 날짜 예약 가능 시간대 목록.
 *
 * 영업시간(working_hours) 안에서 booking_unit_min 간격으로 후보를 만들고,
 * 트레이너의 기존 예약/스케줄이벤트와 겹치거나 지난 시각은 제외.
 * 슬롯 길이 = 수강권 session_minutes.
 */
export async function GET(request: Request) {
  const ctx = await requireMemberContext(request);
  if (isMemberError(ctx)) return ctx;

  const url = new URL(request.url);
  const passId = Number(url.searchParams.get("passId"));
  const date = url.searchParams.get("date");
  if (!passId || !date) {
    return NextResponse.json({ error: "수강권과 날짜가 필요해요" }, { status: 400 });
  }

  const { data: pass } = await supabase
    .from("crm_passes")
    .select("id, member_id, trainer_member_id, session_minutes, status, remaining_sessions")
    .eq("id", passId)
    .eq("center_id", ctx.centerId)
    .eq("member_id", ctx.memberId)
    .maybeSingle();
  if (!pass) return NextResponse.json({ error: "수강권을 찾을 수 없습니다" }, { status: 404 });

  const { data: settings } = await supabase
    .from("crm_center_settings")
    .select("booking_unit_min, working_hours_start, working_hours_end, booking_horizon_days, booking_enabled")
    .eq("center_id", ctx.centerId)
    .maybeSingle();

  if (settings && settings.booking_enabled === false) {
    return NextResponse.json({ slots: [], bookingDisabled: true });
  }

  const unit = settings?.booking_unit_min ?? 60;
  const sessionMin = pass.session_minutes && pass.session_minutes > 0 ? pass.session_minutes : 50;
  const startMin = timeToMin(settings?.working_hours_start ?? "08:00");
  const endMin = timeToMin(settings?.working_hours_end ?? "23:00");
  const horizonDays = settings?.booking_horizon_days ?? 30;

  // 하루 경계(KST)
  const dayStartUtc = new Date(`${date}T00:00:00+09:00`);
  const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 3600 * 1000);

  // 트레이너의 기존 예약 + 스케줄이벤트 (겹침 판정용)
  const [{ data: reservations }, { data: events }] = await Promise.all([
    supabase
      .from("crm_reservations")
      .select("starts_at, ends_at")
      .eq("center_id", ctx.centerId)
      .eq("trainer_member_id", pass.trainer_member_id)
      .in("status", ["requested", "booked", "attended"])
      .gte("starts_at", dayStartUtc.toISOString())
      .lt("starts_at", dayEndUtc.toISOString()),
    supabase
      .from("crm_schedule_events")
      .select("starts_at, ends_at, type, trainer_member_id")
      .eq("center_id", ctx.centerId)
      .eq("status", "active")
      .lt("starts_at", dayEndUtc.toISOString())
      .gt("ends_at", dayStartUtc.toISOString()),
  ]);

  // 이 트레이너에게 적용되는 블록(전체센터 이벤트 or 본인 개인 이벤트)
  const busy: Array<[number, number]> = [];
  for (const r of reservations ?? []) {
    busy.push([new Date(r.starts_at).getTime(), new Date(r.ends_at).getTime()]);
  }
  for (const e of events ?? []) {
    if (e.type === "center" || e.trainer_member_id === pass.trainer_member_id) {
      busy.push([new Date(e.starts_at).getTime(), new Date(e.ends_at).getTime()]);
    }
  }

  const now = Date.now();
  const horizonLimit = now + horizonDays * 24 * 3600 * 1000;
  const slots: Array<{ startsAt: string; endsAt: string }> = [];

  // 슬롯이 영업 종료시각 안에 끝나야 함
  for (let m = startMin; m + sessionMin <= endMin; m += unit) {
    const s = new Date(dayStartUtc.getTime() + m * 60 * 1000);
    const e = new Date(s.getTime() + sessionMin * 60 * 1000);
    const st = s.getTime();
    const et = e.getTime();
    if (st < now) continue; // 지난 시각
    if (st > horizonLimit) continue; // 예약 가능 기간 초과
    const overlaps = busy.some(([bs, be]) => st < be && et > bs);
    if (overlaps) continue;
    slots.push({ startsAt: s.toISOString(), endsAt: e.toISOString() });
  }

  return NextResponse.json({ slots, sessionMinutes: sessionMin });
}
