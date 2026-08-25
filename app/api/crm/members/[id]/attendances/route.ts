import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/members/[id]/attendances?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * 이 회원의 전체 출석(체크인) 내역 (기간 지정 안 하면 전체 최근 500건).
 * crm_attendances 기준. 예약내역과 동일한 달력·리스트 UI 에 쓰임.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const memberId = Number(id);
  if (!memberId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  let q = supabase
    .from("crm_attendances")
    .select("id, member_id, checked_in_at, source, note")
    .eq("center_id", ctx.centerId)
    .eq("member_id", memberId)
    .order("checked_in_at", { ascending: false })
    .limit(500);

  if (from) q = q.gte("checked_in_at", `${from}T00:00:00+09:00`);
  if (to) {
    // to 포함 (다음 날 00시 미만)
    const nextDay = new Date(`${to}T00:00:00+09:00`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    q = q.lt("checked_in_at", nextDay.toISOString());
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({
    attendances: (data ?? []).map((a) => ({
      id: a.id,
      checked_in_at: a.checked_in_at,
      source: a.source ?? null,
      note: a.note ?? null,
    })),
  });
}
