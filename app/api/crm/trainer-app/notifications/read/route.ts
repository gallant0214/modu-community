import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/trainer-app/notifications/read  { centerId }
 * 강사 본인 안읽은 알림 전체를 읽음 처리.
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { error } = await supabase
    .from("crm_staff_notifications")
    .update({ read_at: new Date().toISOString() } as never)
    .eq("center_member_id", ctx.centerMemberId)
    .is("read_at", null);
  if (error) {
    return NextResponse.json({ error: "처리 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
