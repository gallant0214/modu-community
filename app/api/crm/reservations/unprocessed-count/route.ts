import { errDetail } from "@/app/lib/api-error";
import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/reservations/unprocessed-count[?all=1&trainer_id=N]
 * 기간 제한 없이, 수업이 끝났는데(ends_at < 지금) 아직 '예약완료'(booked) — 출석·노쇼 처리 안 된 예약 수.
 * 스케줄 관리 화면의 '총 출석 미처리' 표시용. 행은 받지 않고 개수만 센다(head count).
 *
 * 권한 범위는 GET /api/crm/reservations 와 같다:
 *   기본 = 본인 담당 예약만, all=1 은 schedule.view_others 권한자만(trainer_id 로 특정 강사 필터).
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const trainerParam = url.searchParams.get("trainer_id");
  const allView = url.searchParams.get("all") === "1";
  const canViewAll = allView ? await ctxHasPermission(ctx, "schedule.view_others") : false;

  let query = supabase
    .from("crm_reservations")
    .select("id", { count: "exact", head: true })
    .eq("center_id", ctx.centerId)
    .eq("status", "booked")
    .lt("ends_at", new Date().toISOString());
  if (!canViewAll) {
    query = query.eq("trainer_member_id", ctx.centerMemberId);
  } else if (trainerParam) {
    query = query.eq("trainer_member_id", Number(trainerParam));
  }

  const { count, error } = await query;
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: errDetail(error) }, { status: 500 });
  }
  return NextResponse.json({ count: count ?? 0 });
}
