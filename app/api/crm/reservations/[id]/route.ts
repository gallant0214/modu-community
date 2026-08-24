import { NextResponse } from "next/server";
import { after } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { loadPermissionsForContext } from "@/app/lib/crm-permissions";
import { sendLocalizedPushToMember, memberNotifyOn } from "@/app/lib/member-notify";

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
      "id, center_id, pass_id, member_id, trainer_member_id, status, consumed, starts_at, ends_at, reschedule_history"
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
    // 예약 처리 = schedule.reserve, 타 강사 요청은 schedule.manage_others (직급 권한 일원화)
    const reqPerms = await loadPermissionsForContext(ctx);
    const reqBypass = ctx.role === "owner" || ctx.role === "admin" || ctx.isSoloOwner;
    if (!reqBypass && reqPerms["schedule.reserve"] !== true) {
      return NextResponse.json({ error: "예약 처리 권한이 없습니다" }, { status: 403 });
    }
    if (!reqBypass && cur.trainer_member_id !== ctx.centerMemberId && reqPerms["schedule.manage_others"] !== true) {
      return NextResponse.json({ error: "본인 담당 예약요청만 처리할 수 있어요" }, { status: 403 });
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
        if (!(await memberNotifyOn(cur.member_id, "notify_reservation"))) return;
        await sendLocalizedPushToMember(
          cur.member_id,
          "reservation_approved",
          "reservationConfirmed",
          { _slotIso: cur.starts_at },
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
      const rjReason = body.reason?.trim();
      await sendLocalizedPushToMember(
        cur.member_id,
        "reservation_rejected",
        rjReason ? "reservationRejectedReason" : "reservationRejected",
        { _slotIso: cur.starts_at, ...(rjReason ? { reason: rjReason } : {}) },
        { reservationId: String(reservationId) }
      ).catch(() => {});
    });
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  // 직급권한(schedule.manage_others) 도 타 강사 예약 관리 게이트에 반영
  const rolePerms = await loadPermissionsForContext(ctx);
  const roleAllowsAll = rolePerms["schedule.manage_others"] === true;

  // 직급권한 추가 게이트: 예약 변경·취소=schedule.reserve, 출석확정·취소=schedule.attend
  // (owner/admin/solo 는 통과. 강사별 crm_trainer_permissions 는 아래에서 추가로 확인)
  const gradeBypass = ctx.role === "owner" || ctx.role === "admin" || ctx.isSoloOwner;
  const gradeAllows = (key: string) => gradeBypass || rolePerms[key] === true;
  const isCancelAttendance = cur.status === "attended" && newStatus === "booked";
  if ((isReschedule || newStatus === "cancelled") && !gradeAllows("schedule.reserve")) {
    return NextResponse.json({ error: "예약 변경·취소 권한이 없습니다" }, { status: 403 });
  }
  if ((newStatus === "attended" || newStatus === "noshow" || isCancelAttendance) && !gradeAllows("schedule.attend")) {
    return NextResponse.json({ error: "출석 확정·취소 권한이 없습니다" }, { status: 403 });
  }

  // 타 강사 예약 관리 = schedule.manage_others (개별 강사 컬럼 폐지, 직급 권한으로 일원화)
  if (!gradeBypass && cur.trainer_member_id !== ctx.centerMemberId && !roleAllowsAll) {
    return NextResponse.json({ error: "다른 강사 예약을 관리할 권한이 없어요" }, { status: 403 });
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

    // 변경 이력(사유 포함) — 예약 row 에 누적 저장(강사앱·회원앱·CRM 예약내역에서 표시).
    const reschedReason = (body.reason || "").trim();
    const prevHistory = Array.isArray((cur as { reschedule_history?: unknown }).reschedule_history)
      ? ((cur as { reschedule_history?: unknown[] }).reschedule_history as unknown[])
      : [];
    const historyEntry = {
      from_starts_at: cur.starts_at,
      from_ends_at: cur.ends_at,
      to_starts_at: patch.starts_at,
      to_ends_at: patch.ends_at,
      reason: reschedReason || null,
      changed_at: new Date().toISOString(),
      changed_by_uid: ctx.uid,
    };
    patch.reschedule_history = [...prevHistory, historyEntry];

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
        reason: reschedReason || null,
      } as never,
    });

    // 회원 알림: 예약 시간 변경
    after(async () => {
      await sendLocalizedPushToMember(
        cur.member_id,
        "reservation_rescheduled",
        "reschedule",
        { _slotIso: String(patch.starts_at) },
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

  // 출석 차감 후 잔여 회차(세션제만). 1/0 이면 잔여 안내 알림용.
  let remainingAfter: number | null = null;

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
        remainingAfter = passRow.remaining_sessions - 1;
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

  // 회원 알림: 상태 변경(취소/출석완료/노쇼/예약복구). 실제 변경이 있을 때만. — 회원 언어로 발송
  if (newStatus !== cur.status) {
    const reason = body.reason?.trim();
    const slotIso = cur.starts_at;

    // 서비스 세션(0원 수업) 여부 — 수강권 미연결이거나 결제금액 0 이면 서비스로 본다.
    let isService = !cur.pass_id;
    if (cur.pass_id) {
      const { data: pr } = await supabase
        .from("crm_passes")
        .select("price_won")
        .eq("id", cur.pass_id)
        .maybeSingle();
      isService = ((pr as { price_won?: number | null } | null)?.price_won ?? 0) <= 0;
    }
    // 유료 수강권의 마지막 수업(출석/노쇼로 잔여 0). 서비스 세션은 마일스톤 제외.
    const isPaidLastSession =
      (newStatus === "attended" || newStatus === "noshow") && remainingAfter === 0 && !isService;

    // 알림 on/off: 수업 완료·노쇼(notify_class_result) / 예약 확정·취소(notify_reservation)
    let skipNotice = false;
    if (newStatus === "attended" || newStatus === "noshow") {
      skipNotice = !(await memberNotifyOn(cur.member_id, "notify_class_result"));
    } else if (newStatus === "booked" || newStatus === "cancelled") {
      skipNotice = !(await memberNotifyOn(cur.member_id, "notify_reservation"));
    }

    if (isPaidLastSession) {
      // 마지막 수업(출석/노쇼) → 완료 통합 안내. 마일스톤이라 토글과 무관하게 항상 발송.
      after(async () => {
        await sendLocalizedPushToMember(
          cur.member_id,
          "pass_completed",
          "passCompleted",
          {},
          { reservationId: String(reservationId) }
        ).catch(() => {});
      });
    } else {
      // 일반 상태 알림. 서비스 세션(0원)은 마지막이든 아니든 여기서 '수업 완료 처리' 로 통일.
      const keyMap: Record<string, string> = {
        booked: "reservationConfirmed",
        attended: "classDone",
        cancelled: reason ? "reservationCancelledReason" : "reservationCancelled",
        noshow: "noshow",
      };
      const key = keyMap[newStatus];
      if (key && !skipNotice) {
        after(async () => {
          await sendLocalizedPushToMember(
            cur.member_id,
            `reservation_${newStatus}`,
            key,
            { _slotIso: slotIso, ...(reason ? { reason } : {}) },
            { reservationId: String(reservationId) }
          ).catch(() => {});
        });
      }
      // 유료 수강권 1회 남음 안내(출석 시). 서비스 세션 제외.
      if (newStatus === "attended" && remainingAfter === 1 && !isService) {
        after(async () => {
          await sendLocalizedPushToMember(cur.member_id, "pass_last_session", "passLast", {}, {}).catch(() => {});
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
