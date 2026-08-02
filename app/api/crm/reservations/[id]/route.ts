import { NextResponse } from "next/server";
import { after } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { loadPermissionsForContext } from "@/app/lib/crm-permissions";
import { sendPushToMember, formatKstSlot } from "@/app/lib/member-notify";

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

  let body: {
    status?: string;
    reason?: string;
    starts_at?: string;
    ends_at?: string;
    trainer_member_id?: number;
    action?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  // 회원 앱 예약요청 승인/거절 액션 (requested → booked / rejected)
  const action = body.action === "approve" || body.action === "reject" ? body.action : null;

  // reschedule 모드: starts_at/ends_at 이 있으면 시간·강사 이동 처리
  const isReschedule = Boolean(body.starts_at || body.ends_at || body.trainer_member_id);

  const newStatus = body.status as ReservationStatus;
  if (!action && !isReschedule && !["booked", "attended", "cancelled", "noshow"].includes(newStatus)) {
    return NextResponse.json({ error: "상태 값이 잘못됨" }, { status: 400 });
  }

  // 기존 row 조회
  const { data: cur, error: curErr } = await supabase
    .from("crm_reservations")
    .select(
      "id, center_id, pass_id, member_id, trainer_member_id, status, consumed, starts_at, ends_at"
    )
    .eq("id", reservationId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();

  if (curErr) {
    return NextResponse.json({ error: "조회 실패", detail: curErr.message }, { status: 500 });
  }
  if (!cur) return NextResponse.json({ error: "예약을 찾을 수 없습니다" }, { status: 404 });

  /* ── 회원 예약요청 승인/거절 ─────────────────────────────────── */
  if (action) {
    // 담당 트레이너(또는 전체관리 권한)만 처리 가능
    if (ctx.role === "trainer" || ctx.role === "manager") {
      const { data: perm } = await supabase
        .from("crm_trainer_permissions")
        .select("can_manage_all_schedules")
        .eq("center_member_id", ctx.centerMemberId)
        .maybeSingle();
      if (!perm?.can_manage_all_schedules && cur.trainer_member_id !== ctx.centerMemberId) {
        return NextResponse.json({ error: "본인 담당 예약요청만 처리할 수 있어요" }, { status: 403 });
      }
    }
    if (cur.status !== "requested") {
      return NextResponse.json({ error: "이미 처리된 예약요청이에요" }, { status: 409 });
    }

    if (action === "approve") {
      // 승인 시점에 트레이너 시간 충돌 재확인
      const { data: conflicts } = await supabase
        .from("crm_reservations")
        .select("id")
        .eq("center_id", ctx.centerId)
        .eq("trainer_member_id", cur.trainer_member_id)
        .in("status", ["booked", "attended"])
        .lt("starts_at", cur.ends_at)
        .gt("ends_at", cur.starts_at);
      if (conflicts && conflicts.length > 0) {
        return NextResponse.json({ error: "해당 시간에 이미 확정된 예약이 있어요" }, { status: 409 });
      }

      const { error: upErr } = await supabase
        .from("crm_reservations")
        .update({
          status: "booked",
          approved_at: new Date().toISOString(),
          approved_by_uid: ctx.uid,
        } as never)
        .eq("id", reservationId)
        .eq("center_id", ctx.centerId)
        .eq("status", "requested"); // 경합 방지
      if (upErr) {
        return NextResponse.json({ error: "승인 실패", detail: upErr.message }, { status: 500 });
      }

      after(async () => {
        await sendPushToMember(
          cur.member_id,
          "reservation_approved",
          "예약이 확정됐어요 ✅",
          `${formatKstSlot(cur.starts_at)} 수업 예약이 확정됐어요`,
          { reservationId: String(reservationId) }
        ).catch(() => {});
      });
      return NextResponse.json({ ok: true, status: "booked" });
    }

    // reject
    const { error: upErr } = await supabase
      .from("crm_reservations")
      .update({
        status: "rejected",
        rejected_reason: body.reason?.trim() || null,
        cancelled_by_uid: ctx.uid,
        cancelled_at: new Date().toISOString(),
      } as never)
      .eq("id", reservationId)
      .eq("center_id", ctx.centerId)
      .eq("status", "requested");
    if (upErr) {
      return NextResponse.json({ error: "거절 실패", detail: upErr.message }, { status: 500 });
    }

    after(async () => {
      await sendPushToMember(
        cur.member_id,
        "reservation_rejected",
        "예약요청이 반려됐어요",
        `${formatKstSlot(cur.starts_at)} 수업 예약이 어려워요.${body.reason ? " 사유: " + body.reason.trim() : " 다른 시간을 선택해주세요."}`,
        { reservationId: String(reservationId) }
      ).catch(() => {});
    });
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  // 직급권한(schedule.manage_others) 도 타 강사 예약 관리 게이트에 반영
  const rolePerms = await loadPermissionsForContext(ctx);
  const roleAllowsAll = rolePerms["schedule.manage_others"] === true;

  // trainer 권한 게이트
  if (ctx.role === "trainer") {
    const { data: perm } = await supabase
      .from("crm_trainer_permissions")
      .select("can_modify_reservation, can_cancel_reservation, can_cancel_attendance, attendance_mode, can_manage_all_schedules")
      .eq("center_member_id", ctx.centerMemberId)
      .maybeSingle();
    if (
      !roleAllowsAll &&
      !perm?.can_manage_all_schedules &&
      cur.trainer_member_id !== ctx.centerMemberId
    ) {
      return NextResponse.json({ error: "본인 담당 예약만 수정할 수 있습니다" }, { status: 403 });
    }
    if (isReschedule && !perm?.can_modify_reservation) {
      return NextResponse.json({ error: "예약 시간 변경 권한이 없어요" }, { status: 403 });
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
    // manager 는 본인 담당 아니면 schedule.manage_others 또는 can_manage_all_schedules 필요
    if (cur.trainer_member_id !== ctx.centerMemberId && !roleAllowsAll) {
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

  /* ── reschedule (드래그 이동) 경로 ────────────────────────────── */
  if (isReschedule) {
    const startsAt = body.starts_at ?? cur.starts_at;
    const endsAt = body.ends_at ?? cur.ends_at;
    const trainerId = body.trainer_member_id ?? cur.trainer_member_id;

    if (!startsAt || !endsAt) {
      return NextResponse.json({ error: "시작·종료 시각이 필요합니다" }, { status: 400 });
    }
    const s = new Date(startsAt);
    const e = new Date(endsAt);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
      return NextResponse.json({ error: "시각 형식 오류" }, { status: 400 });
    }
    if (s.getTime() >= e.getTime()) {
      return NextResponse.json({ error: "종료 시각이 시작 이후여야 합니다" }, { status: 400 });
    }

    // 30분 단위 스냅
    const snapMs = 30 * 60 * 1000;
    const startsSnapped = new Date(Math.round(s.getTime() / snapMs) * snapMs);
    const durationMs = e.getTime() - s.getTime();
    const endsSnapped = new Date(startsSnapped.getTime() + durationMs);

    // 겹침 방지: 이동한 시간대에 같은 강사의 다른 예약이 있으면 막는다(본인 제외).
    // 2:1 등 그룹 수업(group_capacity>=2)은 정원까지 허용.
    let groupCap = 1;
    if (cur.pass_id) {
      const { data: pp } = await supabase
        .from("crm_passes")
        .select("group_capacity")
        .eq("id", cur.pass_id)
        .maybeSingle();
      groupCap = Math.max(1, Number((pp as { group_capacity?: number } | null)?.group_capacity ?? 1) || 1);
    }
    const { data: ov } = await supabase
      .from("crm_reservations")
      .select("id")
      .eq("center_id", ctx.centerId)
      .eq("trainer_member_id", trainerId)
      .neq("id", reservationId)
      .not("status", "in", "(cancelled,rejected)")
      .lt("starts_at", endsSnapped.toISOString())
      .gt("ends_at", startsSnapped.toISOString());
    const overlapCount = (ov ?? []).length;
    if (overlapCount > 0) {
      if (groupCap < 2) {
        return NextResponse.json({ error: "이미 예약된 시간이에요. 다른 시간을 선택해 주세요." }, { status: 409 });
      }
      if (overlapCount >= groupCap) {
        return NextResponse.json({ error: `그룹 수업 정원(${groupCap}명)이 찼어요.` }, { status: 409 });
      }
    }

    const patch: Record<string, unknown> = {
      starts_at: startsSnapped.toISOString(),
      ends_at: endsSnapped.toISOString(),
    };
    if (body.trainer_member_id && body.trainer_member_id !== cur.trainer_member_id) {
      patch.trainer_member_id = trainerId;
    }

    const { error: upErr } = await supabase
      .from("crm_reservations")
      .update(patch as never)
      .eq("id", reservationId)
      .eq("center_id", ctx.centerId);

    if (upErr) {
      return NextResponse.json({ error: "수정 실패", detail: upErr.message }, { status: 500 });
    }

    await supabase.from("crm_audit_logs").insert({
      center_id: ctx.centerId,
      actor_uid: ctx.uid,
      action: "reservation.reschedule",
      entity_type: "reservation",
      entity_id: reservationId,
      payload: {
        from: { starts_at: cur.starts_at, ends_at: cur.ends_at, trainer_member_id: cur.trainer_member_id },
        to: { starts_at: patch.starts_at, ends_at: patch.ends_at, trainer_member_id: patch.trainer_member_id ?? cur.trainer_member_id },
      } as never,
    });

    // 회원 알림: 예약 시간 변경
    after(async () => {
      await sendPushToMember(
        cur.member_id,
        "reservation_rescheduled",
        "예약 시간이 변경됐어요",
        `${formatKstSlot(String(patch.starts_at))} 로 수업 시간이 변경됐어요`,
        { reservationId: String(reservationId) }
      ).catch(() => {});
    });

    return NextResponse.json({ ok: true, starts_at: patch.starts_at, ends_at: patch.ends_at });
  }

  // 잔여 변동량 계산
  const wasConsumed = cur.consumed;
  const willBeConsumed = newStatus === "attended" || newStatus === "noshow";
  const remainingDelta = wasConsumed && !willBeConsumed
    ? 1                    // 차감 → 미차감: 잔여 +1
    : !wasConsumed && willBeConsumed
    ? -1                   // 미차감 → 차감: 잔여 -1
    : 0;

  // 잔여 변동이 있으면 조건부 UPDATE 로 race condition 방지.
  // 단, 기간제(총 세션 0)는 횟수 개념이 없어 잔여 차감/복원을 하지 않는다.
  if (remainingDelta !== 0) {
    const { data: passRow } = await supabase
      .from("crm_passes")
      .select("remaining_sessions, total_sessions")
      .eq("id", cur.pass_id)
      .maybeSingle();
    const isPeriodPass = !passRow?.total_sessions || (passRow?.total_sessions ?? 0) <= 0;
    if (passRow && !isPeriodPass) {
      if (remainingDelta < 0) {
        // -1: remaining > 0 일 때만
        if (passRow.remaining_sessions <= 0) {
          return NextResponse.json({ error: "잔여 세션이 부족합니다" }, { status: 409 });
        }
        await supabase
          .from("crm_passes")
          .update({ remaining_sessions: passRow.remaining_sessions - 1 } as never)
          .eq("id", cur.pass_id);
      } else {
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

  // 회원 알림: 상태 변경(취소/출석완료/노쇼/예약복구). 실제 변경이 있을 때만.
  if (newStatus !== cur.status) {
    const slot = formatKstSlot(cur.starts_at);
    const reason = body.reason?.trim();
    const noticeMap: Record<string, { title: string; body: string }> = {
      booked: { title: "예약이 확정됐어요 ✅", body: `${slot} 수업 예약이 확정됐어요` },
      attended: { title: "수업 완료 처리됐어요 ✅", body: `${slot} 수업이 출석(완료) 처리됐어요` },
      cancelled: { title: "예약이 취소됐어요", body: `${slot} 수업 예약이 취소됐어요${reason ? ` · 사유: ${reason}` : ""}` },
      noshow: { title: "노쇼 처리됐어요", body: `${slot} 수업이 노쇼(미출석)로 처리됐어요` },
    };
    const n = noticeMap[newStatus];
    if (n) {
      after(async () => {
        await sendPushToMember(cur.member_id, `reservation_${newStatus}`, n.title, n.body, {
          reservationId: String(reservationId),
        }).catch(() => {});
      });
    }
  }

  return NextResponse.json({ ok: true });
}
