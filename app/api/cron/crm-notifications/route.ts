import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { sendPushToUser } from "@/app/lib/notifications";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/crm-notifications
 *
 * 매일 KST 오전 9시 실행 권장. vercel.json 에 등록.
 *
 * 발송 종류:
 *  1) 회원권 만료 D-7: 7일 후 만료되는 crm_memberships(valid) → linked_firebase_uid 가 있는 회원에게 푸시
 *  2) 수강권 만료 D-7: 같은 패턴, crm_passes(valid) 의 expires_at
 *  3) 예약 D-1: 내일 예약된 crm_reservations(booked)
 *
 * 응답: 발송 통계
 */
export async function GET(request: Request) {
  // Vercel Cron 은 Authorization header 가 없을 수도 있으니 secret 으로도 보호
  const auth = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const today = new Date();
  const todayStr = toKstYMD(today);
  const d7 = addDays(today, 7);
  const d7Str = toKstYMD(d7);
  const d1 = addDays(today, 1);
  const d1Start = new Date(`${toKstYMD(d1)}T00:00:00+09:00`);
  const d1End = new Date(d1Start.getTime() + 24 * 3600 * 1000);

  let sent = 0;
  const errors: string[] = [];

  // 1) 회원권 만료 D-7
  const { data: memberships } = await supabase
    .from("crm_memberships")
    .select("id, member_id, plan_name, expires_at, center_id")
    .eq("status", "valid")
    .eq("expires_at", d7Str);
  for (const m of memberships ?? []) {
    try {
      const { data: member } = await supabase
        .from("crm_members")
        .select("name, linked_firebase_uid")
        .eq("id", m.member_id)
        .maybeSingle();
      if (!member?.linked_firebase_uid) continue;
      await sendPushToUser(
        member.linked_firebase_uid,
        "crm",
        "회원권 만료 임박",
        `${member.name}님의 ${m.plan_name} 회원권이 7일 후 만료돼요.`,
        { kind: "membership_expire", id: String(m.id) }
      );
      sent += 1;
    } catch (e) {
      errors.push(`membership#${m.id}: ${e instanceof Error ? e.message : "error"}`);
    }
  }

  // 2) 수강권 만료 D-7 (잔여 세션이 1회 이상일 때만 의미있는 알림)
  const { data: passes } = await supabase
    .from("crm_passes")
    .select("id, member_id, lesson_kind, remaining_sessions, expires_at")
    .eq("status", "valid")
    .gte("remaining_sessions", 1)
    .eq("expires_at", d7Str);
  for (const p of passes ?? []) {
    try {
      const { data: member } = await supabase
        .from("crm_members")
        .select("name, linked_firebase_uid")
        .eq("id", p.member_id)
        .maybeSingle();
      if (!member?.linked_firebase_uid) continue;
      await sendPushToUser(
        member.linked_firebase_uid,
        "crm",
        "수강권 만료 임박",
        `${member.name}님의 ${p.lesson_kind}이 7일 후 만료돼요. 잔여 ${p.remaining_sessions}회.`,
        { kind: "pass_expire", id: String(p.id) }
      );
      sent += 1;
    } catch (e) {
      errors.push(`pass#${p.id}: ${e instanceof Error ? e.message : "error"}`);
    }
  }

  // 3) 예약 D-1
  const { data: reservations } = await supabase
    .from("crm_reservations")
    .select("id, member_id, starts_at, ends_at, trainer_member_id")
    .eq("status", "booked")
    .gte("starts_at", d1Start.toISOString())
    .lt("starts_at", d1End.toISOString());
  for (const r of reservations ?? []) {
    try {
      const { data: member } = await supabase
        .from("crm_members")
        .select("name, linked_firebase_uid")
        .eq("id", r.member_id)
        .maybeSingle();
      if (!member?.linked_firebase_uid) continue;
      const t = formatTimeKst(r.starts_at);
      await sendPushToUser(
        member.linked_firebase_uid,
        "crm",
        "내일 수업 예약 안내",
        `${member.name}님, 내일 ${t} 수업이 있어요.`,
        { kind: "reservation_reminder", id: String(r.id) }
      );
      sent += 1;
    } catch (e) {
      errors.push(`reservation#${r.id}: ${e instanceof Error ? e.message : "error"}`);
    }
  }

  return NextResponse.json({
    ok: true,
    today: todayStr,
    sent,
    counts: {
      memberships: memberships?.length ?? 0,
      passes: passes?.length ?? 0,
      reservations: reservations?.length ?? 0,
    },
    errors: errors.slice(0, 20),
  });
}

function toKstYMD(d: Date): string {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, "0")}-${String(k.getUTCDate()).padStart(2, "0")}`;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function formatTimeKst(iso: string): string {
  const d = new Date(iso);
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
}
