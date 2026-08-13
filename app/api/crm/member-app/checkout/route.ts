import { NextResponse, after } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";
import { notifyCenterStaffAttendance } from "@/app/lib/crm-staff-notify";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/member-app/checkout  { centerId }
 * 퇴실 적립 — 센터가 켜둔 checkout_mileage_earn 만큼 마일리지 적립. 하루 1회.
 */
export async function POST(request: Request) {
  let body: { centerId?: number };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const ctx = await requireMemberForCenter(request, Number(body.centerId));
  if (isMemberError(ctx)) return ctx;

  const { data: settings } = await supabase
    .from("crm_center_settings")
    .select("checkout_mileage_enabled, checkout_mileage_earn")
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!settings?.checkout_mileage_enabled) {
    return NextResponse.json({ error: "퇴실 적립을 운영하지 않는 센터예요" }, { status: 400 });
  }
  const earn = settings.checkout_mileage_earn ?? 0;
  if (earn <= 0) {
    return NextResponse.json({ error: "적립 포인트가 설정되지 않았어요" }, { status: 400 });
  }

  const todayKst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const dayStartUtc = new Date(`${todayKst}T00:00:00+09:00`).toISOString();
  const dayEndUtc = new Date(new Date(dayStartUtc).getTime() + 24 * 3600 * 1000).toISOString();

  // 오늘 출석(체크인) 해야만 퇴실 적립 가능
  const { count: attendedToday } = await supabase
    .from("crm_attendances")
    .select("id", { count: "exact", head: true })
    .eq("member_id", ctx.memberId)
    .gte("checked_in_at", dayStartUtc)
    .lt("checked_in_at", dayEndUtc);
  if ((attendedToday ?? 0) === 0) {
    return NextResponse.json({ error: "출석하셔야 적립이 가능합니다." }, { status: 400 });
  }

  // 하루 1회 제한
  const { count: doneToday } = await supabase
    .from("crm_member_mileage_logs")
    .select("id", { count: "exact", head: true })
    .eq("member_id", ctx.memberId)
    .eq("reason", "checkout")
    .gte("created_at", dayStartUtc);
  if ((doneToday ?? 0) > 0) {
    return NextResponse.json({ error: "오늘은 이미 퇴실 적립을 받았어요" }, { status: 409 });
  }

  const { data: mem } = await supabase
    .from("crm_members")
    .select("mileage")
    .eq("id", ctx.memberId)
    .maybeSingle();
  const balanceAfter = (mem?.mileage ?? 0) + earn;

  const { error: upErr } = await supabase
    .from("crm_members")
    .update({ mileage: balanceAfter } as never)
    .eq("id", ctx.memberId);
  if (upErr) {
    return NextResponse.json({ error: "적립 실패", detail: upErr.message }, { status: 500 });
  }

  await supabase.from("crm_member_mileage_logs").insert({
    center_id: ctx.centerId,
    member_id: ctx.memberId,
    delta: earn,
    reason: "checkout",
    balance_after: balanceAfter,
  } as never);

  // 퇴실 알림(대표자·관리자 중 ON)
  const centerId = ctx.centerId;
  const memberName = ctx.name;
  after(() => notifyCenterStaffAttendance({ centerId, memberName, kind: "out" }));

  return NextResponse.json({ ok: true, earned: earn, mileage: balanceAfter });
}
