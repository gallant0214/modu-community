import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { verifyAuth } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

/**
 * 수업 시작 전 / 수업 종료 알림 설정 (강사 전역 설정).
 * 서버 크론(crm-class-reminders)이 이 값으로 발송하므로, 기기 로컬이 아니라 서버에 저장한다.
 * 강사는 여러 센터 소속일 수 있어, 본인의 모든 활성 center_member prefs 행에 동일 값으로 기록.
 *
 * GET   → { enabled, leadMinutes, endEnabled }
 * PATCH { enabled?, leadMinutes?, endEnabled? } → 저장
 */
async function myCenterMemberIds(uid: string) {
  const { data } = await supabase
    .from("crm_center_members")
    .select("id, center_id")
    .eq("firebase_uid", uid)
    .eq("status", "active");
  return (data ?? []) as { id: number; center_id: number }[];
}

export async function GET(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const rows = await myCenterMemberIds(user.uid);
  const ids = rows.map((r) => r.id);
  let enabled = true;
  let leadMinutes = 60;
  let endEnabled = true;
  if (ids.length > 0) {
    const { data: prefs } = await supabase
      .from("crm_staff_notification_prefs")
      .select("class_reminder_enabled, class_reminder_lead_min, class_end_enabled")
      .in("center_member_id", ids)
      .limit(1);
    const p = prefs?.[0];
    if (p) {
      enabled = p.class_reminder_enabled !== false;
      leadMinutes = p.class_reminder_lead_min ?? 60;
      endEnabled = p.class_end_enabled !== false;
    }
  }
  return NextResponse.json({ enabled, leadMinutes, endEnabled });
}

export async function PATCH(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  let body: { enabled?: boolean; leadMinutes?: number; endEnabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const rows = await myCenterMemberIds(user.uid);
  if (rows.length === 0) return NextResponse.json({ error: "센터 소속이 아닙니다" }, { status: 403 });

  const patch: Record<string, unknown> = {};
  if (typeof body.enabled === "boolean") patch.class_reminder_enabled = body.enabled;
  if (typeof body.endEnabled === "boolean") patch.class_end_enabled = body.endEnabled;
  if (typeof body.leadMinutes === "number" && body.leadMinutes >= 1 && body.leadMinutes <= 1440) {
    patch.class_reminder_lead_min = Math.round(body.leadMinutes);
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "변경할 값이 없습니다" }, { status: 400 });
  }

  // 본인의 모든 센터 prefs 행에 동일하게 기록(upsert — 행이 없으면 생성).
  const payload = rows.map((r) => ({
    center_member_id: r.id,
    center_id: r.center_id,
    ...patch,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from("crm_staff_notification_prefs")
    .upsert(payload as never, { onConflict: "center_member_id" });
  if (error) {
    return NextResponse.json({ error: "저장 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
