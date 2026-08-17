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
    .select("id, center_id, trainer_member_id, member_id, starts_at")
    .eq("status", "booked")
    .is("attendance_reminded_at", null)
    .lt("ends_at", todayStartUtc)
    .gte("ends_at", lowerBoundUtc)
    .order("starts_at", { ascending: true })
    .limit(2000);

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  const rows = (pending ?? []).filter((r) => r.trainer_member_id);
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, reminded: 0 });
  }

  // 회원 이름
  const memberIds = Array.from(new Set(rows.map((r) => r.member_id)));
  const { data: members } = memberIds.length
    ? await supabase.from("crm_members").select("id, name").in("id", memberIds)
    : { data: [] as { id: number; name: string }[] };
  const nameMap = new Map((members ?? []).map((m) => [m.id, m.name]));

  // 수업 시각(KST) 라벨: "8/15(금) 18:00"
  const DOW = ["일", "월", "화", "수", "목", "금", "토"];
  const slotLabel = (iso: string) => {
    const k = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
    const hh = String(k.getUTCHours()).padStart(2, "0");
    const mm = String(k.getUTCMinutes()).padStart(2, "0");
    return `${k.getUTCMonth() + 1}/${k.getUTCDate()}(${DOW[k.getUTCDay()]}) ${hh}:${mm}`;
  };

  // 수업(회원)별 개별 알림 — "○○ 회원님 수업의 출석 처리가 필요해요"
  for (const r of rows) {
    const memberName = nameMap.get(r.member_id) || "회원";
    await notifyStaffMember({
      centerId: r.center_id,
      centerMemberId: r.trainer_member_id as number,
      type: "attendance_pending",
      title: `${memberName} 회원님 출석 처리가 필요해요`,
      body: `${memberName} 회원님 · ${slotLabel(r.starts_at)} 수업의 출석/노쇼 처리가 필요해요.`,
      data: { kind: "attendance_pending", reservation_id: String(r.id) },
    }).catch(() => {});
  }

  // 재알림 방지: 이번에 알린 예약 전부 표시
  const allIds = rows.map((r) => r.id);
  const nowIso = new Date().toISOString();
  for (let i = 0; i < allIds.length; i += 500) {
    await supabase
      .from("crm_reservations")
      .update({ attendance_reminded_at: nowIso } as never)
      .in("id", allIds.slice(i, i + 500));
  }

  return NextResponse.json({ ok: true, reminded: allIds.length });
}
