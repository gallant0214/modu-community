import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { notifyStaffMember } from "@/app/lib/crm-staff-notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/crm-class-reminders  (10분마다)
 * '수업 시작 전' / '수업 종료' 알림을 담당 강사 폰으로 발송.
 *
 * 🚨 왜 서버 발송인가: 기존엔 앱이 기기에 로컬 알림을 미리 예약했는데, 데스크탑 등
 *    다른 기기에서 수업을 옮기거나 취소해도 폰의 옛 로컬 알림이 취소되지 않아
 *    '옛 시간'에 알림이 울리는 문제가 있었다. 서버가 발송 시점에 실제 예약 상태를
 *    조회해 보내므로, 옮겨지거나 취소된 수업은 옛 시간에 울리지 않는다.
 *    (리스케줄 시 reservations PATCH 가 class_reminder_sent_at/class_end_sent_at 을 리셋)
 *
 * 보안: Vercel x-vercel-cron 헤더 또는 CRON_SECRET.
 */
const MAX_LEAD_MIN = 1440; // 커스텀 리드타임(최대 24시간)까지 커버
const END_GRACE_MIN = 25; // 종료 알림을 놓치지 않기 위한 하한(크론 10분 + 여유)

function hmKst(iso: string): string {
  const k = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  return `${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  const isVercelCron = req.headers.get("x-vercel-cron") !== null;
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const hasValidSecret = cronSecret && authHeader === `Bearer ${cronSecret}`;
  if (!isVercelCron && !hasValidSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const startWindowIso = new Date(now + MAX_LEAD_MIN * 60 * 1000).toISOString();
  const endLowerIso = new Date(now - END_GRACE_MIN * 60 * 1000).toISOString();

  // 1) 시작 전 알림 후보: 아직 시작 안 했고 최대 리드타임 내, 미발송.
  const { data: startRows } = await supabase
    .from("crm_reservations")
    .select("id, center_id, trainer_member_id, member_id, starts_at")
    .eq("status", "booked")
    .is("class_reminder_sent_at", null)
    .gt("starts_at", nowIso)
    .lte("starts_at", startWindowIso)
    .limit(2000);

  // 2) 종료 알림 후보: 방금 끝났고(= now 직전) 미발송, 아직 booked(출석/노쇼 처리 안 됨).
  const { data: endRows } = await supabase
    .from("crm_reservations")
    .select("id, center_id, trainer_member_id, member_id, ends_at")
    .eq("status", "booked")
    .is("class_end_sent_at", null)
    .lte("ends_at", nowIso)
    .gte("ends_at", endLowerIso)
    .limit(2000);

  const starts = (startRows ?? []).filter((r) => r.trainer_member_id);
  const ends = (endRows ?? []).filter((r) => r.trainer_member_id);
  if (starts.length === 0 && ends.length === 0) {
    return NextResponse.json({ ok: true, start: 0, end: 0 });
  }

  // 강사 설정(리드타임·on/off) 일괄 조회.
  const trainerIds = Array.from(
    new Set([...starts, ...ends].map((r) => r.trainer_member_id as number))
  );
  const { data: prefRows } = await supabase
    .from("crm_staff_notification_prefs")
    .select("center_member_id, class_reminder_enabled, class_reminder_lead_min, class_end_enabled")
    .in("center_member_id", trainerIds);
  const prefMap = new Map(
    (prefRows ?? []).map((p) => [p.center_member_id as number, p])
  );

  // 회원 이름 일괄 조회.
  const memberIds = Array.from(
    new Set([...starts, ...ends].map((r) => r.member_id as number).filter(Boolean))
  );
  const { data: memberRows } = memberIds.length
    ? await supabase.from("crm_members").select("id, name").in("id", memberIds)
    : { data: [] as { id: number; name: string }[] };
  const nameMap = new Map((memberRows ?? []).map((m) => [m.id as number, m.name as string]));

  let startSent = 0;
  let endSent = 0;

  // 시작 전 알림
  for (const r of starts) {
    const pref = prefMap.get(r.trainer_member_id as number);
    const enabled = pref ? pref.class_reminder_enabled !== false : true; // 미설정=기본 ON
    if (!enabled) continue;
    const leadMin = pref?.class_reminder_lead_min ?? 60;
    const fireAt = new Date(r.starts_at).getTime() - leadMin * 60 * 1000;
    if (now < fireAt) continue; // 아직 리드타임 전 → 다음 크론에서

    const name = nameMap.get(r.member_id as number) ?? "회원";
    await notifyStaffMember({
      centerId: r.center_id as number,
      centerMemberId: r.trainer_member_id as number,
      type: "class_reminder",
      title: "수업 알림",
      body: `${name} 회원님 수업이 곧 시작돼요. (${hmKst(r.starts_at)})`,
      data: { kind: "class_reminder", reservation_id: String(r.id), member_id: String(r.member_id) },
    }).catch(() => {});
    await supabase
      .from("crm_reservations")
      .update({ class_reminder_sent_at: nowIso } as never)
      .eq("id", r.id)
      .is("class_reminder_sent_at", null); // 경합 방지
    startSent++;
  }

  // 수업 종료 알림
  for (const r of ends) {
    const pref = prefMap.get(r.trainer_member_id as number);
    const enabled = pref ? pref.class_end_enabled !== false : true; // 미설정=기본 ON
    if (!enabled) continue;

    const name = nameMap.get(r.member_id as number) ?? "회원";
    await notifyStaffMember({
      centerId: r.center_id as number,
      centerMemberId: r.trainer_member_id as number,
      type: "class_end",
      title: "수업 종료",
      body: `${name} 회원님 수업이 종료되었어요.`,
      data: { kind: "class_end", reservation_id: String(r.id), member_id: String(r.member_id) },
    }).catch(() => {});
    await supabase
      .from("crm_reservations")
      .update({ class_end_sent_at: nowIso } as never)
      .eq("id", r.id)
      .is("class_end_sent_at", null);
    endSent++;
  }

  return NextResponse.json({ ok: true, start: startSent, end: endSent });
}
