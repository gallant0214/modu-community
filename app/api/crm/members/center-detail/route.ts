import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { loadPermissionsForContext } from "@/app/lib/crm-permissions";
import type { CrmContext } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/members/center-detail?centerId=&memberId=
 * 강사앱 회원목록 → 회원 상세. members.app_view_all 권한자(또는 owner/solo)만.
 * 회원 기본정보 + 회원권(memberships) + 수강권(passes) 반환.
 */
export async function GET(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const url = new URL(request.url);
  const centerId = Number(url.searchParams.get("centerId"));
  const memberId = Number(url.searchParams.get("memberId"));
  if (!centerId || !memberId) {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const { data: me } = await supabase
    .from("crm_center_members")
    .select("id, role, grade_id, is_solo_owner")
    .eq("firebase_uid", user.uid)
    .eq("center_id", centerId)
    .eq("status", "active")
    .maybeSingle();
  if (!me) return NextResponse.json({ error: "이 센터 소속이 아닙니다" }, { status: 403 });

  let allowed = me.is_solo_owner || me.role === "owner";
  if (!allowed) {
    const perms = await loadPermissionsForContext({
      centerId,
      role: me.role,
      gradeId: me.grade_id ?? null,
    } as CrmContext);
    allowed = perms["members.app_view_all"] === true;
  }
  if (!allowed) {
    return NextResponse.json({ error: "회원 열람 권한이 없습니다" }, { status: 403 });
  }

  const [{ data: member }, { data: memberships }, { data: passes }] = await Promise.all([
    supabase
      .from("crm_members")
      .select("id, name, phone, birth, gender, address, status, face_image_thumb, memo, registered_at, member_type")
      .eq("id", memberId)
      .eq("center_id", centerId)
      .maybeSingle(),
    supabase
      .from("crm_memberships")
      .select("id, plan_name, start_date, expires_at, status, is_paused")
      .eq("center_id", centerId)
      .eq("member_id", memberId)
      .neq("status", "deleted")
      .order("expires_at", { ascending: false }),
    supabase
      .from("crm_passes")
      .select("id, lesson_kind, total_sessions, remaining_sessions, session_minutes, start_date, expires_at, status, is_paused")
      .eq("center_id", centerId)
      .eq("member_id", memberId)
      .neq("status", "deleted")
      .order("expires_at", { ascending: false }),
  ]);

  if (!member) return NextResponse.json({ error: "회원을 찾을 수 없습니다" }, { status: 404 });

  return NextResponse.json({
    member,
    memberships: memberships ?? [],
    passes: passes ?? [],
  });
}
