import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * DELETE /api/crm/pauses/[id] — 홀딩 취소
 * 적용했던 만료일 연장(extended_days) 만큼 되돌리고 is_paused = false.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const pauseId = Number(id);
  if (!pauseId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { data: pause, error: pErr } = await supabase
    .from("crm_pauses")
    .select("id, pass_id, membership_id, extended_days, status")
    .eq("id", pauseId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (pErr || !pause) {
    return NextResponse.json({ error: "홀딩 기록을 찾을 수 없습니다" }, { status: 404 });
  }
  if (pause.status === "cancelled") {
    return NextResponse.json({ error: "이미 취소된 홀딩입니다" }, { status: 400 });
  }

  const table = pause.pass_id ? "crm_passes" : "crm_memberships";
  const targetId = (pause.pass_id ?? pause.membership_id) as number;
  const { data: target } = await supabase
    .from(table)
    .select("expires_at")
    .eq("id", targetId)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ error: "원본을 찾을 수 없습니다" }, { status: 404 });
  }

  const restoredExpires = addDays(target.expires_at, -pause.extended_days);

  await supabase
    .from(table)
    .update({ expires_at: restoredExpires, is_paused: false } as never)
    .eq("id", targetId);

  await supabase
    .from("crm_pauses")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by_uid: ctx.uid,
    } as never)
    .eq("id", pauseId);

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "pause.cancel",
    entity_type: pause.pass_id ? "crm_passes" : "crm_memberships",
    entity_id: targetId,
    payload: { pause_id: pauseId, restored_days: pause.extended_days } as never,
  });

  return NextResponse.json({ ok: true, restored_expires_at: restoredExpires });
}
