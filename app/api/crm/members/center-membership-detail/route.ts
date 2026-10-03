import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { loadPermissionsForContext } from "@/app/lib/crm-permissions";
import type { CrmContext } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/members/center-membership-detail?centerId=&membershipId=
 * 강사앱 회원 상세 → 회원권 카드 탭 시 상세 + 홀딩 이력.
 * 권한: center-detail 과 동일(owner/solo 또는 members.app_view_all).
 */
export async function GET(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const url = new URL(request.url);
  const centerId = Number(url.searchParams.get("centerId"));
  const membershipId = Number(url.searchParams.get("membershipId"));
  if (!centerId || !membershipId) {
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

  const { data: membership } = await supabase
    .from("crm_memberships")
    .select(
      "id, member_id, plan_name, duration_days, price_won, discount_won, vat_included, payment_method, payment_method_custom, start_date, expires_at, status, memo, purchased_at, is_paused, seller_member_id"
    )
    .eq("id", membershipId)
    .eq("center_id", centerId)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "회원권을 찾을 수 없습니다" }, { status: 404 });

  // 홀딩 이력 전체(취소분 포함) — 최신순.
  const { data: pauses } = await supabase
    .from("crm_pauses")
    .select("id, start_date, end_date, reason, status, extended_days, created_at, cancelled_at")
    .eq("center_id", centerId)
    .eq("membership_id", membershipId)
    .order("start_date", { ascending: false });

  // 판매자 이름
  let sellerName: string | null = null;
  if (membership.seller_member_id) {
    const { data: s } = await supabase
      .from("crm_center_members")
      .select("display_name")
      .eq("id", membership.seller_member_id)
      .maybeSingle();
    sellerName = s?.display_name ?? null;
  }

  // 오늘(KST) 기준 현재 홀딩 상태.
  const todayKst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  let holdState: "holding" | "scheduled" | null = null;
  for (const p of pauses ?? []) {
    if (p.status !== "active") continue;
    const s = String(p.start_date ?? "").slice(0, 10);
    const e = String(p.end_date ?? "").slice(0, 10);
    if (s && e && s <= todayKst && todayKst <= e) {
      holdState = "holding";
      break;
    }
    if (s && s > todayKst) holdState = "scheduled";
  }

  return NextResponse.json({
    membership: { ...membership, hold_state: holdState },
    seller_name: sellerName,
    pauses: pauses ?? [],
  });
}
