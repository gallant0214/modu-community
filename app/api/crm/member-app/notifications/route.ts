import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/member-app/notifications?centerId=
 * 내 알림 내역(최근 100개) + 안읽음 개수.
 */
export async function GET(request: Request) {
  const centerId = Number(new URL(request.url).searchParams.get("centerId"));
  const ctx = await requireMemberForCenter(request, centerId);
  if (isMemberError(ctx)) return ctx;

  const [{ data, error }, { count }] = await Promise.all([
    supabase
      .from("crm_member_notifications")
      .select("id, type, title, body, data_json, read_at, created_at")
      .eq("member_id", ctx.memberId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("crm_member_notifications")
      .select("id", { count: "exact", head: true })
      .eq("member_id", ctx.memberId)
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
