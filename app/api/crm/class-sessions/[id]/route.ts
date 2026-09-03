import { NextResponse, after } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import { sendLocalizedPushToMember, memberNotifyOn } from "@/app/lib/member-notify";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/class-sessions/[id] — 세션 상세 + 예약 명단.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  const { id } = await params;
  const sessionId = Number(id);
  if (!sessionId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { data: session } = await supabase
    .from("crm_class_sessions")
    .select("id, product_id, trainer_member_id, title, starts_at, ends_at, capacity, status")
    .eq("id", sessionId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: "세션을 찾을 수 없습니다" }, { status: 404 });

  const { data: bookings } = await supabase
    .from("crm_class_bookings")
    .select("id, member_id, status, consumed, booked_at, attended_at")
    .eq("session_id", sessionId)
    .order("booked_at", { ascending: true });

  const memberIds = Array.from(new Set((bookings ?? []).map((b) => b.member_id)));
  const { data: members } = memberIds.length
    ? await supabase.from("crm_members").select("id, name, phone").in("id", memberIds)
    : { data: [] as { id: number; name: string; phone: string | null }[] };
  const nameMap = new Map((members ?? []).map((m) => [m.id, { name: m.name, phone: m.phone }]));

  return NextResponse.json({
    session,
    bookings: (bookings ?? []).map((b) => ({
      ...b,
      member_name: nameMap.get(b.member_id)?.name ?? `#${b.member_id}`,
      member_phone: nameMap.get(b.member_id)?.phone ?? null,
    })),
  });
}

/**
 * DELETE /api/crm/class-sessions/[id] — 클래스 세션 취소.
 * 예약한 회원들의 차감(consumed) 세션은 되돌려주고(잔여 +1) 예약을 취소한다.
 * 권한: schedule.class_create (클래스 수업 생성·취소 동일 권한).
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "schedule.class_create"))) {
    return NextResponse.json({ error: "클래스 수업을 관리할 권한이 없습니다" }, { status: 403 });
  }
  const { id } = await params;
  const sessionId = Number(id);
  if (!sessionId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { data: session } = await supabase
    .from("crm_class_sessions")
    .select("id, starts_at")
    .eq("id", sessionId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: "세션을 찾을 수 없습니다" }, { status: 404 });

  // 활성 예약 → 차감분 환불 후 취소 (센터 사정으로 취소되므로 회원 차감 원복)
  const { data: booked } = await supabase
    .from("crm_class_bookings")
    .select("id, member_id, pass_id, consumed")
    .eq("session_id", sessionId)
    .eq("status", "booked");
  for (const b of booked ?? []) {
    if (b.consumed && b.pass_id) {
      // 잔여 세션 +1 원복
      const { data: pass } = await supabase
        .from("crm_passes")
        .select("remaining_sessions")
        .eq("id", b.pass_id)
        .maybeSingle();
      if (pass) {
        await supabase
          .from("crm_passes")
          .update({ remaining_sessions: (pass.remaining_sessions ?? 0) + 1 } as never)
          .eq("id", b.pass_id);
      }
    }
  }
  await supabase
    .from("crm_class_bookings")
    .update({ status: "cancelled", consumed: false, cancelled_at: new Date().toISOString() } as never)
    .eq("session_id", sessionId)
    .eq("status", "booked");

  await supabase
    .from("crm_class_sessions")
    .update({ status: "cancelled", updated_at: new Date().toISOString() } as never)
    .eq("id", sessionId);

  // 예약자에게 취소 푸시 (센터가 세션을 삭제/취소 → "클래스 수업 예약이 취소되었습니다")
  const notifyMemberIds = Array.from(
    new Set((booked ?? []).map((b) => b.member_id).filter((v): v is number => !!v))
  );
  const startsAt = (session as { starts_at: string }).starts_at;
  after(async () => {
    for (const mid of notifyMemberIds) {
      if (!(await memberNotifyOn(mid, "notify_reservation"))) continue;
      await sendLocalizedPushToMember(
        mid,
        "class_cancelled",
        "classCancelled",
        { _slotIso: startsAt },
        { sessionId: String(sessionId) }
      ).catch(() => {});
    }
  });

  return NextResponse.json({ ok: true });
}
