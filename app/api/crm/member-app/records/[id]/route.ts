import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";

export const dynamic = "force-dynamic";

async function ownRecord(centerId: number, memberId: number, id: number) {
  const { data } = await supabase
    .from("crm_member_daily_records")
    .select("id")
    .eq("id", id)
    .eq("center_id", centerId)
    .eq("member_id", memberId)
    .maybeSingle();
  return !!data;
}

/**
 * PATCH /api/crm/member-app/records/[id]  { centerId, ...fields }
 * 본인 기록만 수정.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const ctx = await requireMemberForCenter(request, Number(body.centerId));
  if (isMemberError(ctx)) return ctx;
  const { id } = await params;
  const recordId = Number(id);

  if (!(await ownRecord(ctx.centerId, ctx.memberId, recordId))) {
    return NextResponse.json({ error: "기록을 찾을 수 없습니다" }, { status: 404 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const numOrNull = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  if ("water_ml" in body) patch.water_ml = numOrNull(body.water_ml);
  if ("weight_kg" in body) patch.weight_kg = numOrNull(body.weight_kg);
  if ("mood" in body) patch.mood = strOrNull(body.mood);
  if ("exercise_minutes" in body) patch.exercise_minutes = numOrNull(body.exercise_minutes);
  if ("exercise_memo" in body) patch.exercise_memo = strOrNull(body.exercise_memo);
  if ("meal_summary" in body) patch.meal_summary = strOrNull(body.meal_summary);
  if ("memo" in body) patch.memo = strOrNull(body.memo);
  if ("share_with_trainer" in body) patch.share_with_trainer = !!body.share_with_trainer;

  const { error } = await supabase
    .from("crm_member_daily_records")
    .update(patch as never)
    .eq("id", recordId)
    .eq("center_id", ctx.centerId)
    .eq("member_id", ctx.memberId);
  if (error) {
    return NextResponse.json({ error: "수정 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/crm/member-app/records/[id]?centerId=
 * 본인 기록 삭제(항목은 FK CASCADE).
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const centerId = Number(new URL(request.url).searchParams.get("centerId"));
  const ctx = await requireMemberForCenter(request, centerId);
  if (isMemberError(ctx)) return ctx;
  const { id } = await params;

  const { error } = await supabase
    .from("crm_member_daily_records")
    .delete()
    .eq("id", Number(id))
    .eq("center_id", ctx.centerId)
    .eq("member_id", ctx.memberId);
  if (error) {
    return NextResponse.json({ error: "삭제 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
