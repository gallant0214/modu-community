import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/member-app/reservations/[id]?centerId=
 * 예약 상세 + 취소 가능 규칙.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const centerId = Number(new URL(request.url).searchParams.get("centerId"));
  const ctx = await requireMemberForCenter(request, centerId);
  if (isMemberError(ctx)) return ctx;
  const { id } = await params;

  const { data: res } = await supabase
    .from("crm_reservations")
    .select("id, pass_id, trainer_member_id, starts_at, ends_at, status, source, booking_reason, cancelled_reason, rejected_reason")
    .eq("id", Number(id))
    .eq("center_id", ctx.centerId)
    .eq("member_id", ctx.memberId)
    .maybeSingle();
  if (!res) return NextResponse.json({ error: "예약을 찾을 수 없습니다" }, { status: 404 });

  const [{ data: pass }, { data: trainer }, { data: settings }] = await Promise.all([
    res.pass_id
      ? supabase.from("crm_passes").select("lesson_kind, session_minutes").eq("id", res.pass_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("crm_center_members").select("display_name").eq("id", res.trainer_member_id).maybeSingle(),
    supabase
      .from("crm_center_settings")
      .select("cancel_enabled, cancel_hours")
      .eq("center_id", ctx.centerId)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    reservation: {
      id: res.id,
      status: res.status,
      source: res.source,
      startsAt: res.starts_at,
      endsAt: res.ends_at,
      lessonKind: pass?.lesson_kind ?? "",
      trainerName: trainer?.display_name ?? "트레이너",
      memberName: ctx.name,
      centerName: ctx.centerName,
      bookingReason: res.booking_reason,
      cancelledReason: res.cancelled_reason,
      rejectedReason: res.rejected_reason,
      cancelEnabled: settings?.cancel_enabled ?? true,
      cancelHours: settings?.cancel_hours ?? 6,
    },
  });
}
