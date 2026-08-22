import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/member-app/notify-settings?centerId=
 * 서버측 알림 수신 설정 조회.
 *  - centerMessages: 센터 메세지 알림 (notify_center_messages)
 *  - classResult: 수업 완료·노쇼 알림 (notify_class_result)
 */
export async function GET(request: Request) {
  const centerId = Number(new URL(request.url).searchParams.get("centerId"));
  const ctx = await requireMemberForCenter(request, centerId);
  if (isMemberError(ctx)) return ctx;

  const { data } = await supabase
    .from("crm_members")
    .select("notify_center_messages, notify_class_result, notify_point_earn, notify_reservation")
    .eq("id", ctx.memberId)
    .maybeSingle();

  const row = data as {
    notify_center_messages?: boolean;
    notify_class_result?: boolean;
    notify_point_earn?: boolean;
    notify_reservation?: boolean;
  } | null;

  return NextResponse.json({
    // 미설정(null)이면 기본 on
    centerMessages: row?.notify_center_messages !== false,
    classResult: row?.notify_class_result !== false,
    pointEarn: row?.notify_point_earn !== false,
    reservation: row?.notify_reservation !== false,
  });
}

/**
 * PATCH /api/crm/member-app/notify-settings  { centerId, centerMessages?, classResult? }
 * 넘어온 항목만 갱신.
 */
export async function PATCH(request: Request) {
  let body: { centerId?: number; centerMessages?: boolean; classResult?: boolean; pointEarn?: boolean; reservation?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const ctx = await requireMemberForCenter(request, Number(body.centerId));
  if (isMemberError(ctx)) return ctx;

  const patch: Record<string, boolean> = {};
  if (typeof body.centerMessages === "boolean") patch.notify_center_messages = body.centerMessages;
  if (typeof body.classResult === "boolean") patch.notify_class_result = body.classResult;
  if (typeof body.pointEarn === "boolean") patch.notify_point_earn = body.pointEarn;
  if (typeof body.reservation === "boolean") patch.notify_reservation = body.reservation;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const { error } = await supabase
    .from("crm_members")
    .update(patch as never)
    .eq("id", ctx.memberId)
    .eq("center_id", ctx.centerId)
    .eq("linked_firebase_uid", ctx.uid);
  if (error) {
    return NextResponse.json({ error: "저장 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...patch });
}
