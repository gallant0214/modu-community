import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/crm/lockers/[id]
 *   action 별 분기 (모든 락커 액션이 여기로):
 *     - assign  : body { member_id, start_date, expires_at, password?, memo? }
 *     - return  : 회수 (회원·날짜·비밀번호 모두 비우고 unassigned)
 *     - update  : { password?, memo?, expires_at? } 부분 수정
 *     - broken  : 고장 처리
 *     - repaired: 고장 해제 → unassigned
 *
 * 모든 액션은 history 에도 기록.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const lockerId = Number(id);
  if (!lockerId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  if (!(await ctxHasPermission(ctx, "lockers.edit"))) {
    return NextResponse.json({ error: "락커를 변경할 권한이 없습니다" }, { status: 403 });
  }

  let body: {
    action?: "assign" | "return" | "update" | "broken" | "repaired" | "move";
    member_id?: number;
    start_date?: string;
    expires_at?: string;
    password?: string;
    memo?: string;
    note?: string;
    to_locker_id?: number;
    /** move 시 두 락커의 비밀번호를 서로 교환할지. true=교환, false/미지정=각 락커 비번 유지. */
    swap_password?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  // 락커 조회 (password/memo 포함 — 수정 diff 용)
  const { data: locker } = await supabase
    .from("crm_lockers")
    .select(
      "id, center_id, zone_id, number, state, assigned_member_id, start_date, expires_at, password, memo"
    )
    .eq("id", lockerId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();

  if (!locker) {
    return NextResponse.json({ error: "락커를 찾을 수 없습니다" }, { status: 404 });
  }

  const action = body.action;
  const updates: Record<string, unknown> = {};
  const history: Record<string, unknown> = {
    center_id: ctx.centerId,
    locker_id: lockerId,
    zone_id: locker.zone_id,
    number: locker.number,
    actor_uid: ctx.uid,
  };

  if (action === "assign") {
    if (locker.state === "broken") {
      return NextResponse.json({ error: "고장 처리된 락커입니다" }, { status: 400 });
    }
    const memberId = Number(body.member_id);
    if (!memberId) return NextResponse.json({ error: "회원을 선택해 주세요" }, { status: 400 });
    if (!body.start_date || !body.expires_at) {
      return NextResponse.json({ error: "시작일과 만료일을 입력해 주세요" }, { status: 400 });
    }

    const { data: member } = await supabase
      .from("crm_members")
      .select("id, name")
      .eq("id", memberId)
      .eq("center_id", ctx.centerId)
      .maybeSingle();
    if (!member) return NextResponse.json({ error: "회원을 찾을 수 없습니다" }, { status: 404 });

    updates.state = "assigned";
    updates.assigned_member_id = memberId;
    updates.start_date = body.start_date;
    updates.expires_at = body.expires_at;
    if (body.password !== undefined) updates.password = body.password || null;
    if (body.memo !== undefined) updates.memo = body.memo || null;

    history.action = "assign";
    history.member_id = memberId;
    history.member_name = member.name;
    history.start_date = body.start_date;
    history.expires_at = body.expires_at;
    history.note = body.note ?? null;
    // 배정 시 등록한 비밀번호 기록 ("무엇으로 등록했는지")
    if (body.password) {
      history.changes = { password: { from: null, to: body.password } };
    }
  } else if (action === "return") {
    if (locker.state !== "assigned") {
      return NextResponse.json({ error: "배정된 락커만 회수할 수 있습니다" }, { status: 400 });
    }
    // history 용 회원 이름 캐싱
    let memberName: string | null = null;
    if (locker.assigned_member_id) {
      const { data: m } = await supabase
        .from("crm_members")
        .select("name")
        .eq("id", locker.assigned_member_id)
        .maybeSingle();
      memberName = m?.name ?? null;
    }
    updates.state = "unassigned";
    updates.assigned_member_id = null;
    updates.start_date = null;
    updates.expires_at = null;
    updates.password = null;
    updates.memo = null;

    history.action = "return";
    history.member_id = locker.assigned_member_id;
    history.member_name = memberName;
    history.note = body.note ?? null;
    // 회수 시점에 남아있던 비밀번호 기록 (해제됨)
    if (locker.password) {
      history.changes = { password: { from: locker.password, to: null } };
    }
  } else if (action === "update") {
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (body.password !== undefined) {
      const nextPw = body.password || null;
      if ((locker.password ?? null) !== nextPw) {
        changes.password = { from: locker.password ?? null, to: nextPw };
        updates.password = nextPw;
      }
    }
    if (body.memo !== undefined) {
      const nextMemo = body.memo || null;
      if ((locker.memo ?? null) !== nextMemo) {
        changes.memo = { from: locker.memo ?? null, to: nextMemo };
        updates.memo = nextMemo;
      }
    }
    if (body.expires_at !== undefined) {
      const nextExp = body.expires_at || null;
      if ((locker.expires_at ?? null) !== nextExp) {
        changes.expires_at = { from: locker.expires_at ?? null, to: nextExp };
        updates.expires_at = nextExp;
      }
    }
    if (body.start_date !== undefined) {
      const nextStart = body.start_date || null;
      if ((locker.start_date ?? null) !== nextStart) {
        changes.start_date = { from: locker.start_date ?? null, to: nextStart };
        updates.start_date = nextStart;
      }
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "변경할 항목이 없어요" }, { status: 400 });
    }
    history.action = "update";
    history.note = body.note ?? null;
    history.changes = changes;
  } else if (action === "move") {
    if (locker.state !== "assigned") {
      return NextResponse.json({ error: "배정된 락커만 이동할 수 있습니다" }, { status: 400 });
    }
    const toId = Number(body.to_locker_id);
    if (!toId) return NextResponse.json({ error: "이동할 락커를 선택해 주세요" }, { status: 400 });

    const { data: target } = await supabase
      .from("crm_lockers")
      .select("id, state, password")
      .eq("id", toId)
      .eq("center_id", ctx.centerId)
      .maybeSingle();
    if (!target) return NextResponse.json({ error: "대상 락커를 찾을 수 없습니다" }, { status: 404 });
    if (target.state !== "unassigned") {
      return NextResponse.json({ error: "대상 락커가 비어있지 않습니다" }, { status: 400 });
    }

    // 대상 락커에 정보 복사
    const { data: fullSource } = await supabase
      .from("crm_lockers")
      .select("assigned_member_id, start_date, expires_at, password, memo")
      .eq("id", lockerId)
      .maybeSingle();
    if (!fullSource) {
      return NextResponse.json({ error: "원본 락커를 찾을 수 없습니다" }, { status: 500 });
    }

    // 비밀번호 처리:
    //   swap_password=true  → 두 락커의 비밀번호를 서로 교환(대상=원본비번, 원본=대상비번).
    //   그 외               → 각 물리 락커의 비밀번호를 그대로 유지(회원만 이동).
    const swap = body.swap_password === true;
    const targetNewPassword = swap ? fullSource.password : target.password;
    const sourceNewPassword = swap ? target.password : fullSource.password;

    const { error: moveErr } = await supabase
      .from("crm_lockers")
      .update({
        state: "assigned",
        assigned_member_id: fullSource.assigned_member_id,
        start_date: fullSource.start_date,
        expires_at: fullSource.expires_at,
        password: targetNewPassword,
        memo: fullSource.memo,
      } as never)
      .eq("id", toId);
    if (moveErr) {
      return NextResponse.json({ error: "이동 실패", detail: moveErr.message }, { status: 500 });
    }

    // 원본 락커 비우기 (비밀번호는 위 규칙에 따라 유지/교환)
    updates.state = "unassigned";
    updates.assigned_member_id = null;
    updates.start_date = null;
    updates.expires_at = null;
    updates.password = sourceNewPassword;
    updates.memo = null;

    // history: move 1건 (원본 락커 기준)
    let memberName: string | null = null;
    if (fullSource.assigned_member_id) {
      const { data: m } = await supabase
        .from("crm_members")
        .select("name")
        .eq("id", fullSource.assigned_member_id)
        .maybeSingle();
      memberName = m?.name ?? null;
    }
    history.action = "move";
    history.member_id = fullSource.assigned_member_id;
    history.member_name = memberName;
    history.start_date = fullSource.start_date;
    history.expires_at = fullSource.expires_at;
    history.note = body.note ?? `→ 락커 #${toId}`;
  } else if (action === "broken") {
    updates.state = "broken";
    history.action = "broken";
    history.note = body.note ?? null;
  } else if (action === "repaired") {
    if (locker.state !== "broken") {
      return NextResponse.json({ error: "고장이 아닙니다" }, { status: 400 });
    }
    updates.state = "unassigned";
    history.action = "repaired";
    history.note = body.note ?? null;
  } else {
    return NextResponse.json({ error: "잘못된 action" }, { status: 400 });
  }

  const { error: upErr } = await supabase
    .from("crm_lockers")
    .update(updates as never)
    .eq("id", lockerId)
    .eq("center_id", ctx.centerId);

  if (upErr) {
    return NextResponse.json({ error: "저장 실패", detail: upErr.message }, { status: 500 });
  }

  await supabase.from("crm_locker_history").insert(history as never);

  return NextResponse.json({ ok: true });
}
