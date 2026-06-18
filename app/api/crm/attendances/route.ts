import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/attendances?date=YYYY-MM-DD
 * 그 날의 출석 기록 (KST). 회원 이름 포함.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);

  const startUtc = new Date(`${date}T00:00:00+09:00`);
  const endUtc = new Date(startUtc.getTime() + 24 * 3600 * 1000);

  const { data, error } = await supabase
    .from("crm_attendances")
    .select("id, member_id, checked_in_at, source, note")
    .eq("center_id", ctx.centerId)
    .gte("checked_in_at", startUtc.toISOString())
    .lt("checked_in_at", endUtc.toISOString())
    .order("checked_in_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  const memberIds = Array.from(new Set((data ?? []).map((a) => a.member_id)));
  const { data: members } = memberIds.length
    ? await supabase.from("crm_members").select("id, name, phone").in("id", memberIds)
    : { data: [] };
  const memberMap = new Map((members ?? []).map((m) => [m.id, m]));

  return NextResponse.json({
    attendances: (data ?? []).map((a) => ({
      ...a,
      member: memberMap.get(a.member_id) ?? null,
    })),
  });
}
