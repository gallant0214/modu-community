import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/member-app/notices/read  { centerId }
 * 공지 알림(type='notice')을 읽음 처리 → 공지줄 미읽음 배지 제거.
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
    .eq("type", "notice")
    .is("read_at", null);
  if (error) {
    return NextResponse.json({ error: "처리 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
