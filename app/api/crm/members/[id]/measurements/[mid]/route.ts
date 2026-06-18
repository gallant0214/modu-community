import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/crm/members/[id]/measurements/[mid]
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; mid: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { id, mid } = await params;
  const memberId = Number(id);
  const measurementId = Number(mid);
  if (!memberId || !measurementId)
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { error } = await supabase
    .from("crm_body_measurements")
    .delete()
    .eq("id", measurementId)
    .eq("member_id", memberId)
    .eq("center_id", ctx.centerId);

  if (error) {
    return NextResponse.json({ error: "삭제 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
