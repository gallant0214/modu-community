import { NextResponse, after } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";
import { notifyStaffMember } from "@/app/lib/crm-staff-notify";
import { formatKstSlot } from "@/app/lib/member-notify";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/crm/member-app/reservations/[id]/cancel
 * body: { centerId }
 *
 * 본인 예약만. requested/booked(미래) 만 취소 가능.
 *  - requested: 언제든 철회
 *  - booked: cancel_enabled + cancel_hours 규정 적용
 * 세션 차감은 출석 시점에만 발생하므로 취소로 인한 차감 없음.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let body: { centerId?: number };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const ctx = await requireMemberForCenter(request, Number(body.centerId));
  if (isMemberError(ctx)) return ctx;
  const { id } = await params;

  const { data: res } = await supabase
    .from("crm_reservations")
    .select("id, status, starts_at, trainer_member_id")
    .eq("id", Number(id))
    .eq("center_id", ctx.centerId)
    .eq("member_id", ctx.memberId)
    .maybeSingle();
  if (!res) return NextResponse.json({ error: "예약을 찾을 수 없습니다" }, { status: 404 });

  if (res.status !== "requested" && res.status !== "booked") {
    return NextResponse.json({ error: "취소할 수 없는 예약이에요" }, { status: 400 });
  }

  if (res.status === "booked") {
    const { data: settings } = await supabase
      .from("crm_center_settings")
      .select("cancel_enabled, cancel_hours")
      .eq("center_id", ctx.centerId)
      .maybeSingle();
    if (settings && settings.cancel_enabled === false) {
      return NextResponse.json({ error: "앱에서 취소가 불가능해요. 센터에 문의해주세요." }, { status: 403 });
    }
    const cancelHours = settings?.cancel_hours ?? 6;
    const deadline = new Date(res.starts_at).getTime() - cancelHours * 3600 * 1000;
    if (Date.now() > deadline) {
      return NextResponse.json({ error: `수업 ${cancelHours}시간 전까지만 취소할 수 있어요` }, { status: 403 });
    }
  }

  const { error } = await supabase
    .from("crm_reservations")
    .update({
      status: "cancelled",
      cancelled_reason: res.status === "requested" ? "회원 요청 철회" : "회원 앱 취소",
      cancelled_by_uid: ctx.uid,
      cancelled_at: new Date().toISOString(),
    } as never)
    .eq("id", res.id)
    .eq("center_id", ctx.centerId)
    .eq("member_id", ctx.memberId);
  if (error) {
    return NextResponse.json({ error: "취소 실패", detail: error.message }, { status: 500 });
  }

  // 담당 강사에게 취소 알림(알림함 저장 + 강사앱 푸시)
  if (res.trainer_member_id) {
    after(async () => {
      await notifyStaffMember({
        centerId: ctx.centerId,
        centerMemberId: res.trainer_member_id as number,
        type: "reservation_cancelled",
        title: "예약 취소",
        body: `${ctx.name}님이 ${formatKstSlot(res.starts_at)} 수업 예약을 취소했어요`,
        data: { kind: "reservation_cancelled", reservation_id: String(res.id) },
      }).catch(() => {});
    });
  }

  return NextResponse.json({ ok: true });
}
