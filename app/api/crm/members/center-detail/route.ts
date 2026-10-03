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

  const [{ data: member }, { data: memberships }, { data: passes }, { data: pauses }] = await Promise.all([
    supabase
      .from("crm_members")
      .select("id, name, phone, birth, gender, address, status, mileage, face_image_thumb, face_image_data, memo, registered_at, member_type")
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
    // 홀딩(정지) '기간' 판정용 — is_paused 플래그는 홀딩 취소/종료 후에도 켜진 채로 남는
    // 경우가 있어 신뢰 불가. 반드시 crm_pauses(status='active')의 start~end 창으로 판정.
    supabase
      .from("crm_pauses")
      .select("membership_id, pass_id, start_date, end_date, status")
      .eq("center_id", centerId)
      .eq("member_id", memberId)
      .eq("status", "active"),
  ]);

  if (!member) return NextResponse.json({ error: "회원을 찾을 수 없습니다" }, { status: 404 });

  // 오늘(KST) 기준 홀딩 상태: 'holding'(기간 내) | 'scheduled'(시작 전) | null(없음/종료)
  const todayKst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const holdStateFor = (field: "membership_id" | "pass_id", id: number): "holding" | "scheduled" | null => {
    const rows = (pauses ?? []).filter((p) => (p as Record<string, unknown>)[field] === id);
    let scheduled = false;
    for (const p of rows) {
      const s = String(p.start_date ?? "").slice(0, 10);
      const e = String(p.end_date ?? "").slice(0, 10);
      if (s && e && s <= todayKst && todayKst <= e) return "holding";
      if (s && s > todayKst) scheduled = true;
    }
    return scheduled ? "scheduled" : null;
  };

  const membershipsOut = (memberships ?? []).map((m) => ({ ...m, hold_state: holdStateFor("membership_id", m.id) }));
  const passesOut = (passes ?? []).map((p) => ({ ...p, hold_state: holdStateFor("pass_id", p.id) }));

  return NextResponse.json({
    member,
    memberships: membershipsOut,
    passes: passesOut,
  });
}
