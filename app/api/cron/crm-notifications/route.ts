import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { sendLocalizedPushToMember } from "@/app/lib/member-notify";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/crm-notifications
 *
 * 매일 KST 오전 9시 실행 권장. vercel.json 에 등록.
 *
 * 발송 종류:
 *  - 예약 D-1: 내일 예약된 crm_reservations(booked)
 *
 * ※ 회원권 만료(D-7/당일)·수강권 만료 안내는 [자동 메세지] 설정 UI + /api/cron/crm-auto-messages
 *   로 일원화되었다(센터가 on/off·발송시각·문구·채널을 직접 제어). 중복 발송 방지 위해 여기서 제거.
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
  const d1 = addDays(today, 1);
  const d1Start = new Date(`${toKstYMD(d1)}T00:00:00+09:00`);
  const d1End = new Date(d1Start.getTime() + 24 * 3600 * 1000);

  let sent = 0;
  const errors: string[] = [];

  // 예약 D-1
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
      await sendLocalizedPushToMember(
        r.member_id,
        "reservation_reminder",
        "reservationReminder",
        { name: member.name, time: t },
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
