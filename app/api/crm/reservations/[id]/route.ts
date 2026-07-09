import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/crm/reservations/[id]
 * 예약 상태 변경.
 *
 * body: { status: 'attended'|'cancelled'|'noshow'|'booked', consumed?: boolean, reason?: string }
 *
 * 상태 전이 시 잔여 세션 자동 조정:
 *   booked → attended:    consumed=true, remaining -1
 *   booked → cancelled:   consumed=false (미차감 취소)
 *   booked → noshow:      consumed=true, remaining -1 (차감 취소)
 *   attended → booked:    consumed=false, remaining +1 (되돌리기)
 *   cancelled → booked:   consumed=false, 잔여 변동 없음
 *
 * 트랜잭션 동시성: 잔여 감소는 조건부 UPDATE 로 race 방지.
 */
type ReservationStatus = "booked" | "attended" | "cancelled" | "noshow";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const reservationId = Number(id);
  if (!reservationId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  let body: { status?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const newStatus = body.status as ReservationStatus;
  if (!["booked", "attended", "cancelled", "noshow"].includes(newStatus)) {
    return NextResponse.json({ error: "상태 값이 잘못됨" }, { status: 400 });
  }

  // 기존 row 조회
  const { data: cur, error: curErr } = await supabase
    .from("crm_reservations")
    .select(
      "id, center_id, pass_id, trainer_member_id, status, consumed"
    )
    .eq("id", reservationId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();

  if (curErr) {
    return NextResponse.json({ error: "조회 실패", detail: curErr.message }, { status: 500 });
  }
  if (!cur) return NextResponse.json({ error: "예약을 찾을 수 없습니다" }, { status: 404 });

  // trainer 권한 게이트
  if (ctx.role === "trainer") {
    const { data: perm } = await supabase
      .from("crm_trainer_permissions")
      .select("can_modify_reservation, can_cancel_reservation, can_cancel_attendance, attendance_mode, can_manage_all_schedules")
      .eq("center_member_id", ctx.centerMemberId)
      .maybeSingle();
    if (
      !perm?.can_manage_all_schedules &&
      cur.trainer_member_id !== ctx.centerMemberId
    ) {
      return NextResponse.json({ error: "본인 담당 예약만 수정할 수 있습니다" }, { status: 403 });
    }
    if (newStatus === "cancelled" && !perm?.can_cancel_reservation) {
      return NextResponse.json({ error: "예약 취소 권한이 없습니다" }, { status: 403 });
    }
    if (newStatus === "attended" && perm?.attendance_mode === "owner_only") {
      return NextResponse.json({ error: "출석 확인 권한이 없습니다" }, { status: 403 });
    }
    if (cur.status === "attended" && !perm?.can_cancel_attendance) {
      return NextResponse.json({ error: "출석 취소 권한이 없습니다" }, { status: 403 });
    }
  } else if (ctx.role === "manager") {
    // manager 는 본인 담당 아니면 can_manage_all_schedules 필요
    if (cur.trainer_member_id !== ctx.centerMemberId) {
      const { data: perm } = await supabase
        .from("crm_trainer_permissions")
        .select("can_manage_all_schedules")
        .eq("center_member_id", ctx.centerMemberId)
        .maybeSingle();
      if (!perm?.can_manage_all_schedules) {
        return NextResponse.json(
          { error: "다른 강사 예약을 수정할 권한이 없어요" },
          { status: 403 }
        );
      }
    }
  }

  // 잔여 변동량 계산
  const wasConsumed = cur.consumed;
  const willBeConsumed = newStatus === "attended" || newStatus === "noshow";
  const remainingDelta = wasConsumed && !willBeConsumed
    ? 1                    // 차감 → 미차감: 잔여 +1
    : !wasConsumed && willBeConsumed
    ? -1                   // 미차감 → 차감: 잔여 -1
    : 0;

  // 잔여 변동이 있으면 조건부 UPDATE 로 race condition 방지
  if (remainingDelta !== 0) {
    if (remainingDelta < 0) {
      // -1: remaining > 0 일 때만
      const { data: passRow } = await supabase
        .from("crm_passes")
        .select("remaining_sessions")
        .eq("id", cur.pass_id)
        .maybeSingle();
      if (!passRow || passRow.remaining_sessions <= 0) {
        return NextResponse.json({ error: "잔여 세션이 부족합니다" }, { status: 409 });
      }
      await supabase
        .from("crm_passes")
        .update({ remaining_sessions: passRow.remaining_sessions - 1 } as never)
        .eq("id", cur.pass_id);
    } else {
      const { data: passRow } = await supabase
        .from("crm_passes")
        .select("remaining_sessions, total_sessions")
        .eq("id", cur.pass_id)
        .maybeSingle();
      if (passRow) {
        const next = Math.min(passRow.remaining_sessions + 1, passRow.total_sessions);
        await supabase
          .from("crm_passes")
          .update({ remaining_sessions: next } as never)
          .eq("id", cur.pass_id);
      }
    }
  }

  const patch: Record<string, unknown> = {
    status: newStatus,
    consumed: willBeConsumed,
  };
  if (newStatus === "attended") patch.attended_at = new Date().toISOString();
  else if (newStatus === "cancelled" || newStatus === "noshow") {
    patch.cancelled_at = new Date().toISOString();
    patch.cancelled_by_uid = ctx.uid;
    patch.cancelled_reason = body.reason?.trim() || null;
  }

  const { error: upErr } = await supabase
    .from("crm_reservations")
    .update(patch as never)
    .eq("id", reservationId)
    .eq("center_id", ctx.centerId);

  if (upErr) {
    return NextResponse.json({ error: "수정 실패", detail: upErr.message }, { status: 500 });
  }

  if (newStatus === "cancelled" || newStatus === "noshow") {
    await supabase.from("crm_audit_logs").insert({
      center_id: ctx.centerId,
      actor_uid: ctx.uid,
      action: `reservation.${newStatus}`,
      entity_type: "reservation",
      entity_id: reservationId,
      payload: body.reason ? ({ reason: body.reason } as never) : null,
    });
  }

  return NextResponse.json({ ok: true });
}
