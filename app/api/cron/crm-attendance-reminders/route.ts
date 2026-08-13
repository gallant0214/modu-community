import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { notifyStaffMember } from "@/app/lib/crm-staff-notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/crm-attendance-reminders  (매일 1회)
 * 수업이 하루 지났는데도 출석/노쇼 처리(attended/noshow)가 안 된 예약(booked)에 대해
 * 담당 강사에게 "출석 여부를 처리해 주세요" 알림 + 푸시. 예약당 1회만(재알림 방지).
 *
 * 보안: Vercel x-vercel-cron 헤더 또는 CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const isVercelCron = req.headers.get("x-vercel-cron") !== null;
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const hasValidSecret = cronSecret && authHeader === `Bearer ${cronSecret}`;
  if (!isVercelCron && !hasValidSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 오늘 00:00(KST) 이전에 끝난 수업 = '하루가 지난' 것으로 간주. 너무 오래된 건(14일 초과) 제외.
  const nowKst = new Date(Date.now() + 9 * 3600 * 1000);
  const todayKstYmd = nowKst.toISOString().slice(0, 10);
  const todayStartUtc = new Date(`${todayKstYmd}T00:00:00+09:00`).toISOString();
  const lowerBoundUtc = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();

  const { data: pending, error } = await supabase
    .from("crm_reservations")
    .select("id, center_id, trainer_member_id, starts_at")
    .eq("status", "booked")
    .is("attendance_reminded_at", null)
    .lt("ends_at", todayStartUtc)
    .gte("ends_at", lowerBoundUtc)
    .order("starts_at", { ascending: true })
    .limit(2000);

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  const rows = pending ?? [];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, reminded: 0, trainers: 0 });
  }

  // (센터, 강사)별 그룹
  const groups = new Map<
    string,
    { centerId: number; trainerId: number; count: number; firstId: number }
  >();
  const allIds: number[] = [];
  for (const r of rows) {
    if (!r.trainer_member_id) continue;
    allIds.push(r.id);
    const key = `${r.center_id}:${r.trainer_member_id}`;
    const g = groups.get(key);
    if (g) g.count += 1;
    else groups.set(key, { centerId: r.center_id, trainerId: r.trainer_member_id, count: 1, firstId: r.id });
  }

  // 그룹별 알림
  for (const g of groups.values()) {
    await notifyStaffMember({
      centerId: g.centerId,
      centerMemberId: g.trainerId,
      type: "attendance_pending",
      title: "출석 처리 필요",
      body: `출석/노쇼 처리가 안 된 수업이 ${g.count}건 있어요. 출석 여부를 처리해 주세요.`,
      data: { kind: "attendance_pending", reservation_id: String(g.firstId) },
    }).catch(() => {});
  }

  // 재알림 방지: 이번에 알린 예약 전부 표시
  const nowIso = new Date().toISOString();
  for (let i = 0; i < allIds.length; i += 500) {
    await supabase
      .from("crm_reservations")
      .update({ attendance_reminded_at: nowIso } as never)
      .in("id", allIds.slice(i, i + 500));
  }

  return NextResponse.json({ ok: true, reminded: allIds.length, trainers: groups.size });
}
