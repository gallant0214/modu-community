import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { loadPermissionsForContext } from "@/app/lib/crm-permissions";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/crm/schedule-events/[id]
 * 소프트 삭제 (status=cancelled). 본인이 만든 일정만 삭제 가능.
 * owner/admin 은 모두 삭제 가능.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const eventId = Number(id);
  if (!eventId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { data: ev } = await supabase
    .from("crm_schedule_events")
    .select("id, type, created_by_uid, trainer_member_id")
    .eq("id", eventId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!ev) return NextResponse.json({ error: "일정을 찾을 수 없어요" }, { status: 404 });

  const isAdmin = ctx.role === "owner" || ctx.role === "admin";
  const isOwnerOfEvent = ev.created_by_uid === ctx.uid;
  let hasManageAll = false;
  if (!isAdmin && !isOwnerOfEvent) {
    // 타 강사 일정 관리 = schedule.manage_others (직급 권한 일원화)
    hasManageAll =
      ctx.isSoloOwner || (await loadPermissionsForContext(ctx))["schedule.manage_others"] === true;
  }
  if (!isAdmin && !isOwnerOfEvent && !hasManageAll) {
    return NextResponse.json({ error: "삭제 권한이 없어요" }, { status: 403 });
  }

  const { error } = await supabase
    .from("crm_schedule_events")
    .update({ status: "cancelled" } as never)
    .eq("id", eventId);
  if (error) {
    return NextResponse.json({ error: "삭제 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * PATCH /api/crm/schedule-events/[id]
 * 일정 수정 — 제목·내용·시간 이동(드래그 reschedule). 본인이 만든 일정 또는
 * owner/admin/can_manage_all_schedules 만 가능. 센터 일정으로의 전환은 관리자 권한 필요.
 * body: { title?, description?, starts_at?, ends_at?, type? }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const eventId = Number(id);
  if (!eventId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  let body: {
    title?: string;
    description?: string | null;
    starts_at?: string;
    ends_at?: string;
    type?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const { data: ev } = await supabase
    .from("crm_schedule_events")
    .select("id, type, created_by_uid, trainer_member_id")
    .eq("id", eventId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!ev) return NextResponse.json({ error: "일정을 찾을 수 없어요" }, { status: 404 });

  const isAdmin = ctx.role === "owner" || ctx.role === "admin" || ctx.isSoloOwner;
  const isOwnerOfEvent = ev.created_by_uid === ctx.uid;
  let hasManageAll = isAdmin;
  if (!hasManageAll) {
    // 타 강사 일정 관리 = schedule.manage_others (직급 권한 일원화)
    hasManageAll = (await loadPermissionsForContext(ctx))["schedule.manage_others"] === true;
  }
  if (!isAdmin && !isOwnerOfEvent && !hasManageAll) {
    return NextResponse.json({ error: "수정 권한이 없어요" }, { status: 403 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.title === "string") {
    const t = body.title.trim();
    if (!t) return NextResponse.json({ error: "제목을 입력해 주세요" }, { status: 400 });
    patch.title = t;
  }
  if (body.description !== undefined) {
    patch.description = (body.description ?? "").toString().trim() || null;
  }
  if (body.starts_at) patch.starts_at = body.starts_at;
  if (body.ends_at) patch.ends_at = body.ends_at;

  // 센터 ↔ 개인 전환: 센터 일정 지정은 관리자 권한 필요
  if (body.type === "center" || body.type === "personal") {
    if (body.type === "center" && !hasManageAll) {
      return NextResponse.json({ error: "센터 일정은 관리자만 지정할 수 있어요" }, { status: 403 });
    }
    patch.type = body.type;
    patch.trainer_member_id = body.type === "personal" ? ctx.centerMemberId : null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase
    .from("crm_schedule_events")
    .update(patch as never)
    .eq("id", eventId);
  if (error) {
    return NextResponse.json({ error: "수정 실패", detail: error.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "schedule_event.update",
    entity_type: "crm_schedule_events",
    entity_id: eventId,
    payload: patch as never,
  });

  return NextResponse.json({ ok: true });
}
