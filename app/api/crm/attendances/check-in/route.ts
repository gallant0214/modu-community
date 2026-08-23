import { NextResponse, after } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import { runCheckIn } from "@/app/lib/crm-checkin";
import { notifyCenterStaffAttendance } from "@/app/lib/crm-staff-notify";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/attendances/check-in
 * body: { token?: string, member_id?: number, source?: 'kiosk'|'manual'|'touch_number'|'touch_face', center_id? }
 *
 * - token(회원 checkin_token) 또는 member_id 로 회원 조회 → runCheckIn 실행.
 * 공유 체크인 로직은 app/lib/crm-checkin.ts (공개 키오스크 라우트와 공용).
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "attendance.manage"))) {
    return NextResponse.json({ error: "출석 관리 권한이 없습니다" }, { status: 403 });
  }

  let body: { token?: string; member_id?: number; source?: string; center_id?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  // 다른 센터 회원(개인 CRM 통합 목록 등)을 출석 처리할 때 center_id 로 대상 센터 지정.
  let targetCenterId = ctx.centerId;
  const centerParam = Number(body.center_id) || 0;
  if (centerParam && centerParam !== ctx.centerId) {
    const { data: om } = await supabase
      .from("crm_center_members")
      .select("id")
      .eq("firebase_uid", ctx.uid)
      .eq("center_id", centerParam)
      .eq("status", "active")
      .maybeSingle();
    if (om) targetCenterId = centerParam;
  }

  let member: { id: number; name: string; phone: string | null; birth: string | null } | null = null;
  if (body.token) {
    const { data } = await supabase
      .from("crm_members")
      .select("id, name, phone, birth")
      .eq("center_id", targetCenterId)
      .eq("checkin_token", body.token.trim())
      .eq("status", "active")
      .maybeSingle();
    member = data;
  } else if (body.member_id) {
    const { data } = await supabase
      .from("crm_members")
      .select("id, name, phone, birth")
      .eq("center_id", targetCenterId)
      .eq("id", body.member_id)
      .eq("status", "active")
      .maybeSingle();
    member = data;
  }
  if (!member) {
    return NextResponse.json({ error: "회원을 찾을 수 없습니다" }, { status: 404 });
  }

  const source = (() => {
    switch (body.source) {
      case "manual":
        return "manual";
      case "touch_face":
        return "touch_face";
      case "touch_number":
        return "touch_number";
      case "touch":
        return "touch";
      default:
        return "kiosk";
    }
  })();

  const result = await runCheckIn(targetCenterId, member, source);
  if ("error" in result) {
    return NextResponse.json({ error: result.error, detail: result.detail }, { status: result.status });
  }
  // 중복(최근 5분)이 아니면 출석 알림(대표자·관리자 중 ON) 발송
  if (!("duplicate" in result && result.duplicate)) {
    const memberName = member.name;
    const mId = member.id;
    after(() => notifyCenterStaffAttendance({ centerId: targetCenterId, memberId: mId, memberName, kind: "in" }));
  }
  return NextResponse.json(result);
}
