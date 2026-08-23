import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";

export const dynamic = "force-dynamic";

/** PATCH /api/crm/members/[id]/workout-logs/[logId] — 메모/날짜 수정 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; logId: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "members.records"))) {
    return NextResponse.json({ error: "운동기록·체성분 수정 권한이 없습니다" }, { status: 403 });
  }
  const { id, logId } = await params;
  const memberId = Number(id);
  const lid = Number(logId);
  if (!memberId || !lid) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  let body: { log_date?: string; memo?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.memo === "string") {
    const m = body.memo.trim();
    if (!m) return NextResponse.json({ error: "운동 내용을 비울 수 없어요" }, { status: 400 });
    patch.memo = m.slice(0, 5000);
  }
  if (typeof body.log_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.log_date)) {
    patch.log_date = body.log_date;
  }

  const { error } = await supabase
    .from("crm_member_workout_logs")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(patch as any)
    .eq("id", lid)
    .eq("center_id", ctx.centerId)
    .eq("member_id", memberId);
  if (error) {
    return NextResponse.json({ error: "저장 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** DELETE /api/crm/members/[id]/workout-logs/[logId] */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; logId: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "members.records"))) {
    return NextResponse.json({ error: "운동기록·체성분 수정 권한이 없습니다" }, { status: 403 });
  }
  const { id, logId } = await params;
  const memberId = Number(id);
  const lid = Number(logId);
  if (!memberId || !lid) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { error } = await supabase
    .from("crm_member_workout_logs")
    .delete()
    .eq("id", lid)
    .eq("center_id", ctx.centerId)
    .eq("member_id", memberId);
  if (error) {
    return NextResponse.json({ error: "삭제 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
