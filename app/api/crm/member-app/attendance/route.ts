import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/member-app/attendance?centerId=&from=YYYY-MM-DD&to=YYYY-MM-DD
 * 회원권 출석(체크인, crm_attendances) 날짜 목록 (KST ymd). 스케줄 달력의 출석 표시용.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const centerId = Number(url.searchParams.get("centerId"));
  const ctx = await requireMemberForCenter(request, centerId);
  if (isMemberError(ctx)) return ctx;

  const from = url.searchParams.get("from") || new Date(Date.now() - 200 * 864e5).toISOString().slice(0, 10);
  const to = url.searchParams.get("to") || new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const fromUtc = new Date(`${from}T00:00:00+09:00`).toISOString();
  // to 당일 포함 → to+1일 자정(KST) 미만
  const toEndUtc = new Date(new Date(`${to}T00:00:00+09:00`).getTime() + 24 * 3600 * 1000).toISOString();

  const { data } = await supabase
    .from("crm_attendances")
    .select("checked_in_at")
    .eq("member_id", ctx.memberId)
    .gte("checked_in_at", fromUtc)
    .lt("checked_in_at", toEndUtc);

  const dates = Array.from(
    new Set(
      (data ?? []).map((a) =>
        new Date(new Date(a.checked_in_at).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
      )
    )
  );

  return NextResponse.json({ dates });
}
