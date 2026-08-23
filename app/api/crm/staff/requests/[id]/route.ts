import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/staff/requests/[id]
 * body: { action: 'approve' | 'reject' }
 *
 * 강사 가입 요청(status='pending') 수락/거절. owner/admin 만.
 *  - approve: status='active', access_level='schedule', joined_at=now,
 *             강사 권한 row(전부 true) 생성. → 앱에서 스케줄 사용 가능.
 *  - reject : 요청 row 삭제(재요청 가능).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "staff.manage"))) {
    return NextResponse.json({ error: "직원 관리 권한이 없습니다" }, { status: 403 });
  }

  const { id } = await params;
  const memberId = Number(id);
  if (!memberId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const action = body.action;
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "action 값이 잘못됨" }, { status: 400 });
  }

  // 본 센터의 pending 요청인지 확인
  const { data: member } = await supabase
    .from("crm_center_members")
    .select("id, display_name, status, role")
    .eq("id", memberId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!member || member.status !== "pending") {
    return NextResponse.json({ error: "대기중인 요청을 찾을 수 없습니다" }, { status: 404 });
  }

  if (action === "reject") {
    const { error } = await supabase
      .from("crm_center_members")
      .delete()
      .eq("id", memberId)
      .eq("center_id", ctx.centerId);
    if (error) {
      return NextResponse.json({ error: "거절 실패", detail: error.message }, { status: 500 });
    }
    await supabase.from("crm_audit_logs").insert({
      center_id: ctx.centerId,
      actor_uid: ctx.uid,
      action: "staff.join_reject",
      entity_type: "center_member",
      entity_id: memberId,
      payload: { display_name: member.display_name } as never,
    });
    return NextResponse.json({ ok: true, action: "reject" });
  }

  // approve
  const { error: upErr } = await supabase
    .from("crm_center_members")
    .update({
      status: "active",
      access_level: "schedule",
      joined_at: new Date().toISOString(),
    } as never)
    .eq("id", memberId)
    .eq("center_id", ctx.centerId);
  if (upErr) {
    return NextResponse.json({ error: "수락 실패", detail: upErr.message }, { status: 500 });
  }

  // 강사 권한 row 보장 (없으면 생성, 있으면 유지)
  await supabase.from("crm_trainer_permissions").upsert(
    {
      center_member_id: memberId,
      can_create_reservation: true,
      can_modify_reservation: true,
      can_cancel_reservation: true,
      attendance_mode: "trainer",
      can_cancel_attendance: true,
      can_issue_pass: true,
    } as never,
    { onConflict: "center_member_id" }
  );

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "staff.join_approve",
    entity_type: "center_member",
    entity_id: memberId,
    payload: { display_name: member.display_name } as never,
  });

  return NextResponse.json({ ok: true, action: "approve" });
}
