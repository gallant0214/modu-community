import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { loadPermissionsForContext } from "@/app/lib/crm-permissions";
import type { CrmContext } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * 가입 및 등록 알림 설정 (센터별). 회원 신규가입·상품 구매/환불 시 알림.
 *  - GET  : 내가 속한 활성 센터 목록 + 역할 + 현재 on/off + canManage(app_notify.signup_purchase 권한 보유 여부).
 *  - PATCH?centerId= { enabled } : 권한 있는 사람만 on/off. 없으면 403('권한이 없습니다').
 *
 * 권한 = owner/admin/soloOwner 는 항상, 그 외 직급은 CRM 직급권한 'app_notify.signup_purchase' 가 true 여야 함.
 */
export async function GET(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { data: memberships } = await supabase
    .from("crm_center_members")
    .select("id, center_id, role, grade_id, is_solo_owner, crm_centers!inner(name)")
    .eq("firebase_uid", user.uid)
    .eq("status", "active");

  const rows = memberships ?? [];
  const ids = rows.map((m) => m.id);
  const { data: prefs } = ids.length
    ? await supabase
        .from("crm_staff_notification_prefs")
        .select("center_member_id, notify_signup_purchase")
        .in("center_member_id", ids)
    : { data: [] as { center_member_id: number; notify_signup_purchase: boolean }[] };
  const onMap = new Map((prefs ?? []).map((p) => [p.center_member_id, p.notify_signup_purchase === true]));

  const centers = await Promise.all(
    rows.map(async (m) => {
      const c = Array.isArray(m.crm_centers)
        ? m.crm_centers[0]
        : (m.crm_centers as { name?: string } | null);
      let canManage = m.role === "owner" || m.role === "admin" || m.is_solo_owner === true;
      if (!canManage) {
        const perms = await loadPermissionsForContext({
          centerId: m.center_id,
          role: m.role,
          gradeId: m.grade_id ?? null,
        } as CrmContext);
        canManage = perms["app_notify.signup_purchase"] === true;
      }
      return {
        centerId: m.center_id,
        centerName: c?.name ?? "",
        role: m.role,
        canManage,
        enabled: onMap.get(m.id) === true,
      };
    })
  );

  return NextResponse.json({ centers });
}

export async function PATCH(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  // 가입 및 등록 알림 권한 있는 사람만 켤 수 있음
  let canManage = ctx.role === "owner" || ctx.role === "admin" || ctx.isSoloOwner === true;
  if (!canManage) {
    const perms = await loadPermissionsForContext(ctx);
    canManage = perms["app_notify.signup_purchase"] === true;
  }
  if (!canManage) {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  let body: { enabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const enabled = body.enabled === true;

  const { error } = await supabase.from("crm_staff_notification_prefs").upsert(
    {
      center_member_id: ctx.centerMemberId,
      center_id: ctx.centerId,
      notify_signup_purchase: enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "center_member_id" }
  );
  if (error) {
    return NextResponse.json({ error: "저장 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, enabled });
}
