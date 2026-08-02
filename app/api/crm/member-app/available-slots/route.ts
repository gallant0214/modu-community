import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";

export const dynamic = "force-dynamic";

function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

/**
 * GET /api/crm/member-app/available-slots?centerId=&passId=&date=YYYY-MM-DD
 * 수강권 담당 트레이너의 해당 날짜 예약 가능 시간대.
 *
 * 영업시간 안에서 booking_unit_min 간격 후보 생성 → 트레이너의 기존 예약/스케줄이벤트와
 * 겹치는 정도가 정원(group_capacity) 이상이면 제외. 지난 시각·기간 초과 제외.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const centerId = Number(url.searchParams.get("centerId"));
  const ctx = await requireMemberForCenter(request, centerId);
  if (isMemberError(ctx)) return ctx;

  const passId = Number(url.searchParams.get("passId"));
  const date = url.searchParams.get("date");
  if (!passId || !date) {
    return NextResponse.json({ error: "수강권과 날짜가 필요해요" }, { status: 400 });
  }

  const { data: pass } = await supabase
    .from("crm_passes")
    .select("id, member_id, trainer_member_id, session_minutes, group_capacity, status")
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
  const capacity = pass.group_capacity && pass.group_capacity > 0 ? pass.group_capacity : 1;
  const startMin = timeToMin(settings?.working_hours_start ?? "08:00");
  const endMin = timeToMin(settings?.working_hours_end ?? "23:00");
  const horizonDays = settings?.booking_horizon_days ?? 30;

  const dayStartUtc = new Date(`${date}T00:00:00+09:00`);
  const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 3600 * 1000);

  const [{ data: reservations }, { data: events }] = await Promise.all([
    supabase
      .from("crm_reservations")
      .select("starts_at, ends_at, member_id")
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

  const resv = (reservations ?? []).map((r) => ({
    s: new Date(r.starts_at).getTime(),
    e: new Date(r.ends_at).getTime(),
    mine: r.member_id === ctx.memberId,
  }));
  // 스케줄이벤트(휴무/개인일정)는 정원과 무관하게 완전 차단
  const blocks: Array<[number, number]> = [];
  for (const ev of events ?? []) {
    if (ev.type === "center" || ev.trainer_member_id === pass.trainer_member_id) {
      blocks.push([new Date(ev.starts_at).getTime(), new Date(ev.ends_at).getTime()]);
    }
  }

  const now = Date.now();
  const horizonLimit = now + horizonDays * 24 * 3600 * 1000;
  const slots: Array<{ startsAt: string; endsAt: string }> = [];

  for (let m = startMin; m + sessionMin <= endMin; m += unit) {
    const s = new Date(dayStartUtc.getTime() + m * 60 * 1000);
    const e = new Date(s.getTime() + sessionMin * 60 * 1000);
    const st = s.getTime();
    const et = e.getTime();
    if (st < now || st > horizonLimit) continue;
    if (blocks.some(([bs, be]) => st < be && et > bs)) continue;
    const overlapping = resv.filter((r) => st < r.e && et > r.s);
    if (overlapping.some((r) => r.mine)) continue; // 내 예약이 이미 겹침
    if (overlapping.length >= capacity) continue; // 정원 참
    slots.push({ startsAt: s.toISOString(), endsAt: e.toISOString() });
  }

  return NextResponse.json({ slots, sessionMinutes: sessionMin, groupCapacity: capacity });
}
