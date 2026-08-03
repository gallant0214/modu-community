import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/member-app/summary?centerId=
 * 홈 상단용: 센터 최신 공지 1건 + 보유 마일리지 + 퇴실 적립 설정/오늘 적립여부.
 */
export async function GET(request: Request) {
  const centerId = Number(new URL(request.url).searchParams.get("centerId"));
  const ctx = await requireMemberForCenter(request, centerId);
  if (isMemberError(ctx)) return ctx;

  const todayKst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const dayStartUtc = new Date(`${todayKst}T00:00:00+09:00`).toISOString();

  // 이번 주(일~토, KST) 범위
  const nowKst = new Date(Date.now() + 9 * 3600 * 1000);
  const dow = nowKst.getUTCDay(); // 0=일
  const weekStartKst = new Date(nowKst);
  weekStartKst.setUTCHours(0, 0, 0, 0);
  weekStartKst.setUTCDate(weekStartKst.getUTCDate() - dow);
  const weekStartUtc = new Date(weekStartKst.getTime() - 9 * 3600 * 1000).toISOString();
  const weekEndUtc = new Date(weekStartKst.getTime() + 7 * 24 * 3600 * 1000 - 9 * 3600 * 1000).toISOString();

  const [{ data: notice }, { data: mem }, { data: settings }, { count: checkoutToday }, { data: atts }, { count: noticeUnread }] = await Promise.all([
    supabase
      .from("crm_center_notices")
      .select("id, title, body, created_at")
      .eq("center_id", ctx.centerId)
      .eq("status", "active")
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("crm_members").select("mileage").eq("id", ctx.memberId).maybeSingle(),
    supabase
      .from("crm_center_settings")
      .select("checkout_mileage_enabled, checkout_mileage_earn")
      .eq("center_id", ctx.centerId)
      .maybeSingle(),
    supabase
      .from("crm_member_mileage_logs")
      .select("id", { count: "exact", head: true })
      .eq("member_id", ctx.memberId)
      .eq("reason", "checkout")
      .gte("created_at", dayStartUtc),
    supabase
      .from("crm_attendances")
      .select("checked_in_at")
      .eq("member_id", ctx.memberId)
      .gte("checked_in_at", weekStartUtc)
      .lt("checked_in_at", weekEndUtc),
    supabase
      .from("crm_member_notifications")
      .select("id", { count: "exact", head: true })
      .eq("member_id", ctx.memberId)
      .eq("type", "notice")
      .is("read_at", null),
  ]);

  // 이번 주 출석한 요일(KST ymd) 집합
  const weekAttendance = Array.from(
    new Set(
      (atts ?? []).map((a) =>
        new Date(new Date(a.checked_in_at).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
      )
    )
  );

  return NextResponse.json({
    notice: notice
      ? { id: notice.id, title: notice.title, body: notice.body, createdAt: notice.created_at }
      : null,
    noticeUnread: noticeUnread ?? 0,
    mileage: mem?.mileage ?? 0,
    checkout: {
      enabled: settings?.checkout_mileage_enabled ?? false,
      earn: settings?.checkout_mileage_earn ?? 0,
      doneToday: (checkoutToday ?? 0) > 0,
    },
    weekAttendance,
  });
}
