import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/staff/requests
 *   - ?count=1 → { count } 만 (사이드바/탭 배지용, 가벼움)
 *   - 기본     → { requests: [...] } 대기중(status='pending') 강사 가입 요청 목록
 *
 * owner/admin 만.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  if (url.searchParams.get("count") === "1") {
    const { count, error } = await supabase
      .from("crm_center_members")
      .select("id", { count: "exact", head: true })
      .eq("center_id", ctx.centerId)
      .eq("status", "pending");
    if (error) {
      return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
    }
    return NextResponse.json({ count: count ?? 0 });
  }

  const { data, error } = await supabase
    .from("crm_center_members")
    .select("id, firebase_uid, display_name, email, phone, requested_at, created_at")
    .eq("center_id", ctx.centerId)
    .eq("status", "pending")
    .order("requested_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ requests: data ?? [] });
}
