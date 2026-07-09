import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

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
  if (!isAdmin && !isOwnerOfEvent) {
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
