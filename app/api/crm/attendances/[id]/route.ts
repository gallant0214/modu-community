import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";

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
  if (!(await ctxHasPermission(ctx, "attendance.manage"))) {
    return NextResponse.json({ error: "출석 관리 권한이 없습니다" }, { status: 403 });
  }

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

  // 마지막 출석일 스냅샷 재계산 — 남은 출석기록의 최신일(KST), 없으면 null.
  try {
    const { data: rest } = await supabase
      .from("crm_attendances")
      .select("checked_in_at")
      .eq("center_id", ctx.centerId)
      .eq("member_id", att.member_id)
      .order("checked_in_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastYmd = (rest as { checked_in_at?: string } | null)?.checked_in_at
      ? new Date(new Date((rest as { checked_in_at: string }).checked_in_at).getTime() + 9 * 3600 * 1000)
          .toISOString()
          .slice(0, 10)
      : null;
    await supabase
      .from("crm_members")
      .update({ last_attended_at: lastYmd } as never)
      .eq("id", att.member_id)
      .eq("center_id", ctx.centerId);
  } catch {
    /* 스냅샷 재계산 실패해도 취소 자체는 성공 */
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
