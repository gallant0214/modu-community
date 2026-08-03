import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/member-app/mileage/history?centerId=
 * 보유 마일리지 잔액 + 적립/사용 이력.
 * 원장(crm_member_mileage_logs) + 출석 적립(crm_attendances.attendance_mileage_awarded) 병합.
 */
export async function GET(request: Request) {
  const centerId = Number(new URL(request.url).searchParams.get("centerId"));
  const ctx = await requireMemberForCenter(request, centerId);
  if (isMemberError(ctx)) return ctx;

  const [{ data: mem }, { data: logs }, { data: atts }] = await Promise.all([
    supabase.from("crm_members").select("mileage").eq("id", ctx.memberId).maybeSingle(),
    supabase
      .from("crm_member_mileage_logs")
      .select("id, delta, reason, created_at")
      .eq("member_id", ctx.memberId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("crm_attendances")
      .select("id, attendance_mileage_awarded, checked_in_at")
      .eq("member_id", ctx.memberId)
      .gt("attendance_mileage_awarded", 0)
      .order("checked_in_at", { ascending: false })
      .limit(100),
  ]);

  type Entry = { id: string; delta: number; reason: string; at: string };
  const entries: Entry[] = [];
  for (const l of logs ?? []) {
    entries.push({ id: `l-${l.id}`, delta: l.delta, reason: l.reason, at: l.created_at });
  }
  for (const a of atts ?? []) {
    entries.push({
      id: `a-${a.id}`,
      delta: a.attendance_mileage_awarded ?? 0,
      reason: "attendance",
      at: a.checked_in_at,
    });
  }
  entries.sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0));

  return NextResponse.json({
    mileage: mem?.mileage ?? 0,
    entries: entries.slice(0, 100),
  });
}
