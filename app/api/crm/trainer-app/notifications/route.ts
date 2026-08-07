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

  return NextResponse.json({
    unreadCount: count ?? 0,
    notifications: (data ?? []).map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      data: n.data_json,
      readAt: n.read_at,
      createdAt: n.created_at,
    })),
  });
}
