import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/crm/attendances/[id] — 출석 취소.
 * 잘못 찍힌 출석 삭제. 출석 마일리지가 적립됐으면 회원 잔고에서 되돌림.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const attId = Number(id);
  if (!attId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  // 본 센터 출석인지 확인 + 적립 마일리지 회수용 정보
  const { data: att } = await supabase
    .from("crm_attendances")
    .select("id, member_id, attendance_mileage_awarded")
    .eq("id", attId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!att) {
    return NextResponse.json({ error: "출석 기록을 찾을 수 없습니다" }, { status: 404 });
  }

  const awarded = Number((att as { attendance_mileage_awarded?: number }).attendance_mileage_awarded) || 0;

  // 적립됐던 출석 마일리지 회수 (잔고 0 미만 방지)
  if (awarded > 0) {
    const { data: mem } = await supabase
      .from("crm_members")
      .select("mileage")
      .eq("id", att.member_id)
      .eq("center_id", ctx.centerId)
      .maybeSingle();
    const next = Math.max(0, (mem?.mileage ?? 0) - awarded);
    await supabase
      .from("crm_members")
      .update({ mileage: next } as never)
      .eq("id", att.member_id)
      .eq("center_id", ctx.centerId);
  }

  const { error } = await supabase
    .from("crm_attendances")
    .delete()
    .eq("id", attId)
    .eq("center_id", ctx.centerId);
  if (error) {
    return NextResponse.json({ error: "취소 실패", detail: error.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "attendance.cancel",
    entity_type: "member",
    entity_id: att.member_id,
    payload: { attendance_id: attId, mileage_reversed: awarded } as never,
  });

  return NextResponse.json({ ok: true, mileage_reversed: awarded });
}
