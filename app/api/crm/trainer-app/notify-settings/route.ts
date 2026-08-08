import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * 강사 알림 설정 (서버 발송 알림의 on/off).
 * 기본값은 모두 true — 행이 없으면 켜진 것으로 간주.
 *
 * GET   /api/crm/trainer-app/notify-settings?centerId=
 * PATCH /api/crm/trainer-app/notify-settings?centerId=
 *   body: { reservation_request?: boolean, reservation_cancelled?: boolean }
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { data } = await supabase
    .from("crm_staff_notification_prefs")
    .select("notify_reservation_request, notify_reservation_cancelled")
    .eq("center_member_id", ctx.centerMemberId)
    .maybeSingle();

  return NextResponse.json({
    reservation_request: data?.notify_reservation_request ?? true,
    reservation_cancelled: data?.notify_reservation_cancelled ?? true,
  });
}

export async function PATCH(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  let body: { reservation_request?: boolean; reservation_cancelled?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const patch: Record<string, boolean> = {};
  if (typeof body.reservation_request === "boolean")
    patch.notify_reservation_request = body.reservation_request;
  if (typeof body.reservation_cancelled === "boolean")
    patch.notify_reservation_cancelled = body.reservation_cancelled;

  const { error } = await supabase.from("crm_staff_notification_prefs").upsert(
    {
      center_member_id: ctx.centerMemberId,
      center_id: ctx.centerId,
      ...patch,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "center_member_id" }
  );
  if (error) {
    return NextResponse.json({ error: "저장 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
