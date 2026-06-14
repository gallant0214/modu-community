import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

const ATTENDANCE_MODES = ["trainer", "owner_only"] as const;

/**
 * PATCH /api/crm/staff/[id]/permissions
 * 트레이너 권한 토글 (PDF 2-3). owner/admin 만 진입.
 *
 * body: { can_create_reservation?, can_modify_reservation?, can_cancel_reservation?,
 *         attendance_mode?, can_cancel_attendance?, can_issue_pass? }
 *
 * row 가 없으면 INSERT, 있으면 UPDATE (upsert).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const memberId = Number(id);
  if (!memberId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  // 같은 센터 소속 확인
  const { data: member } = await supabase
    .from("crm_center_members")
    .select("id, center_id")
    .eq("id", memberId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();

  if (!member) {
    return NextResponse.json({ error: "직원을 찾을 수 없습니다" }, { status: 404 });
  }

  let body: {
    can_create_reservation?: boolean;
    can_modify_reservation?: boolean;
    can_cancel_reservation?: boolean;
    attendance_mode?: string;
    can_cancel_attendance?: boolean;
    can_issue_pass?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.can_create_reservation === "boolean")
    patch.can_create_reservation = body.can_create_reservation;
  if (typeof body.can_modify_reservation === "boolean")
    patch.can_modify_reservation = body.can_modify_reservation;
  if (typeof body.can_cancel_reservation === "boolean")
    patch.can_cancel_reservation = body.can_cancel_reservation;
  if (typeof body.can_cancel_attendance === "boolean")
    patch.can_cancel_attendance = body.can_cancel_attendance;
  if (typeof body.can_issue_pass === "boolean")
    patch.can_issue_pass = body.can_issue_pass;
  if (body.attendance_mode !== undefined) {
    if (!ATTENDANCE_MODES.includes(body.attendance_mode as "trainer" | "owner_only")) {
      return NextResponse.json({ error: "출석 권한 값이 잘못됨" }, { status: 400 });
    }
    patch.attendance_mode = body.attendance_mode;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "변경할 항목이 없습니다" }, { status: 400 });
  }

  // upsert: row 가 없으면 인서트
  const { error: upErr } = await supabase
    .from("crm_trainer_permissions")
    .upsert(
      {
        center_member_id: memberId,
        ...patch,
      } as never,
      { onConflict: "center_member_id" }
    );

  if (upErr) {
    return NextResponse.json({ error: "수정 실패", detail: upErr.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "staff.permissions.update",
    entity_type: "center_member",
    entity_id: memberId,
    payload: patch as never,
  });

  return NextResponse.json({ ok: true });
}
