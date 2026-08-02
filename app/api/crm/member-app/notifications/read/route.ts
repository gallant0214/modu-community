import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/member-app/notifications/read  { centerId }
 * 내 안읽은 알림 전체를 읽음 처리.
 */
export async function POST(request: Request) {
  let body: { centerId?: number };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const ctx = await requireMemberForCenter(request, Number(body.centerId));
  if (isMemberError(ctx)) return ctx;

  const { error } = await supabase
    .from("crm_member_notifications")
    .update({ read_at: new Date().toISOString() } as never)
    .eq("member_id", ctx.memberId)
    .is("read_at", null);
  if (error) {
    return NextResponse.json({ error: "처리 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
