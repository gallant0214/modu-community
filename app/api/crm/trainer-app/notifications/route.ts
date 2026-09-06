import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/trainer-app/notifications?centerId=
 * 강사 본인 알림 내역(최근 100개) + 안읽음 개수.
 * 회원 앱 /api/crm/member-app/notifications 의 강사 버전.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const [{ data, error }, { count }] = await Promise.all([
    supabase
      .from("crm_staff_notifications")
      .select("id, type, title, body, data_json, read_at, created_at")
      .eq("center_member_id", ctx.centerMemberId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("crm_staff_notifications")
      .select("id", { count: "exact", head: true })
      .eq("center_member_id", ctx.centerMemberId)
      .is("read_at", null),
  ]);
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  const notifs = data ?? [];
  // 회원 관련 알림은 아이콘 대신 회원 얼굴 썸네일을 표시 → 해당 회원 사진 일괄 조회
  const MEMBER_TYPES = new Set([
    "member_attendance",
    "member_assigned",
    "member_signup",
    "member_purchase",
    "member_refund",
  ]);
  const midOf = (n: (typeof notifs)[number]) =>
    MEMBER_TYPES.has(n.type) ? Number((n.data_json as { member_id?: string | number } | null)?.member_id) || 0 : 0;
  const memberIds = Array.from(new Set(notifs.map(midOf).filter((id) => id > 0)));
  const faceMap = new Map<number, string>();
  if (memberIds.length > 0) {
    const { data: mems } = await supabase
      .from("crm_members")
      .select("id, face_image_thumb")
      .eq("center_id", ctx.centerId)
      .in("id", memberIds);
    for (const m of mems ?? []) {
      if (m.face_image_thumb) faceMap.set(m.id, m.face_image_thumb as string);
    }
  }

  return NextResponse.json({
    unreadCount: count ?? 0,
    notifications: notifs.map((n) => {
      const mid = midOf(n);
      return {
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        data: n.data_json,
        memberFace: mid ? faceMap.get(mid) ?? null : null,
        readAt: n.read_at,
        createdAt: n.created_at,
      };
    }),
  });
}
