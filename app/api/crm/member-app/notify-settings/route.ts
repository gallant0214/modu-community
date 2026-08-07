import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/member-app/notify-settings?centerId=
 * 서버측 알림 수신 설정 조회. (현재: 센터 메세지 알림 on/off)
 */
export async function GET(request: Request) {
  const centerId = Number(new URL(request.url).searchParams.get("centerId"));
  const ctx = await requireMemberForCenter(request, centerId);
  if (isMemberError(ctx)) return ctx;

  const { data } = await supabase
    .from("crm_members")
    .select("notify_center_messages")
    .eq("id", ctx.memberId)
    .maybeSingle();

  return NextResponse.json({
    // 미설정(null)이면 기본 on
    centerMessages: (data as { notify_center_messages?: boolean } | null)?.notify_center_messages !== false,
  });
}

/**
 * PATCH /api/crm/member-app/notify-settings  { centerId, centerMessages: boolean }
 * 센터 메세지 푸시 수신 여부 저장.
 */
export async function PATCH(request: Request) {
  let body: { centerId?: number; centerMessages?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const ctx = await requireMemberForCenter(request, Number(body.centerId));
  if (isMemberError(ctx)) return ctx;

  if (typeof body.centerMessages !== "boolean") {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const { error } = await supabase
    .from("crm_members")
    .update({ notify_center_messages: body.centerMessages } as never)
    .eq("id", ctx.memberId)
    .eq("center_id", ctx.centerId)
    .eq("linked_firebase_uid", ctx.uid);
  if (error) {
    return NextResponse.json({ error: "저장 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, centerMessages: body.centerMessages });
}
