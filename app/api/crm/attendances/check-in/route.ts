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

  let body: { token?: string; member_id?: number; source?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  let member: { id: number; name: string; phone: string | null; birth: string | null } | null = null;

  if (body.token) {
    const { data } = await supabase
      .from("crm_members")
      .select("id, name, phone, birth")
      .eq("center_id", ctx.centerId)
      .eq("checkin_token", body.token.trim())
      .eq("status", "active")
      .maybeSingle();
    member = data;
  } else if (body.member_id) {
    const { data } = await supabase
      .from("crm_members")
      .select("id, name, phone, birth")
      .eq("center_id", ctx.centerId)
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
    .eq("center_id", ctx.centerId)
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

  const source =
    body.source === "manual" ? "manual" : body.source === "touch" ? "touch" : "kiosk";

  const { data: created, error } = await supabase
    .from("crm_attendances")
    .insert({
      center_id: ctx.centerId,
      member_id: member.id,
      source,
    })
    .select("id, checked_in_at")
    .single();

  if (error || !created) {
    return NextResponse.json({ error: "출석 실패", detail: error?.message }, { status: 500 });
  }

  // 출석 마일리지 적립 (하루 1회). 하루에 여러 번 방문해도 한 번만 적립.
  const mileageAwarded = await awardAttendanceMileage(ctx.centerId, member.id, created.id);

  // 음성 안내 메세지 계산 (센터가 규칙을 등록해뒀을 때만 반환).
  // 실패해도 체크인 자체는 성공으로 응답해야 하므로 try/catch.
  let voiceMessages: string[] = [];
  try {
    voiceMessages = await buildAttendanceVoiceMessages(ctx.centerId, member);
  } catch {
    voiceMessages = [];
  }

  return NextResponse.json({
    ok: true,
    member,
    attendance: created,
    mileage_awarded: mileageAwarded,
    voice_messages: voiceMessages,
  });
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

  // 유효 회원권 중 출석 적립 마일리지 최댓값
  const { data: memberships } = await supabase
    .from("crm_memberships")
    .select("attendance_mileage_earn")
    .eq("center_id", centerId)
    .eq("member_id", memberId)
    .eq("status", "valid")
    .eq("is_paused", false)
    .gte("expires_at", ymd);

  const amount = Math.max(
    0,
    ...(memberships ?? []).map((m) => Number(m.attendance_mileage_earn) || 0)
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
