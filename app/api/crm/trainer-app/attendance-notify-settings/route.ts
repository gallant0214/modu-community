import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * 출석/퇴실 알림 설정 (센터별).
 *  - GET  : 내가 속한 활성 센터 목록 + 역할 + 현재 on/off. 대표자·관리자(또는 개인CRM 본인)만 켤 수 있음.
 *  - PATCH?centerId= { enabled } : 해당 센터 알림 on/off. owner/admin/soloOwner 만 가능, 아니면 403.
 */
export async function GET(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { data: memberships } = await supabase
    .from("crm_center_members")
    .select("id, center_id, role, is_solo_owner, crm_centers!inner(name)")
    .eq("firebase_uid", user.uid)
    .eq("status", "active");

  const rows = memberships ?? [];
  const ids = rows.map((m) => m.id);
  const { data: prefs } = ids.length
    ? await supabase
        .from("crm_staff_notification_prefs")
        .select("center_member_id, notify_attendance")
        .in("center_member_id", ids)
    : { data: [] as { center_member_id: number; notify_attendance: boolean }[] };
  const onMap = new Map((prefs ?? []).map((p) => [p.center_member_id, p.notify_attendance === true]));

  const centers = rows.map((m) => {
    const c = Array.isArray(m.crm_centers)
      ? m.crm_centers[0]
      : (m.crm_centers as { name?: string } | null);
    const canManage = m.role === "owner" || m.role === "admin" || m.is_solo_owner === true;
    return {
      centerId: m.center_id,
      centerName: c?.name ?? "",
      role: m.role,
      canManage,
      enabled: onMap.get(m.id) === true,
    };
  });

  return NextResponse.json({ centers });
}

export async function PATCH(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  // 대표자·관리자(또는 개인CRM 본인)만 켤 수 있음
  const canManage = ctx.role === "owner" || ctx.role === "admin" || ctx.isSoloOwner === true;
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
      notify_attendance: enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "center_member_id" }
  );
  if (error) {
    return NextResponse.json({ error: "저장 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, enabled });
}
