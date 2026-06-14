import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/staff
 * 본인 센터의 직원 목록. owner/admin 만 진입.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { data, error } = await supabase
    .from("crm_center_members")
    .select(
      "id, firebase_uid, role, display_name, phone, email, access_level, is_solo_owner, status, joined_at, left_at"
    )
    .eq("center_id", ctx.centerId)
    .order("status", { ascending: true })   // active 먼저
    .order("role", { ascending: false })    // owner > trainer 알파벳 역순 ≈ 등급 높은 순 (간이)
    .order("joined_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ staff: data ?? [] });
}
