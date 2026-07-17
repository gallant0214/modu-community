import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/stats/cancellations?from=YYYY-MM-DD&to=YYYY-MM-DD&trainer_member_id=N
 *
 * 취소·노쇼된 예약 로그 + 사유별 집계 (starts_at 기준, monthly 통계와 동일).
 * trainer/manager 는 본인 담당(trainer_member_id) 분만.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  if (!ymd.test(from) || !ymd.test(to)) {
    return NextResponse.json({ error: "기간(from/to)이 필요합니다" }, { status: 400 });
  }
  const toExcl = new Date(`${to}T00:00:00Z`);
  toExcl.setUTCDate(toExcl.getUTCDate() + 1);
  const nextDay = toExcl.toISOString().slice(0, 10);

  const trainerParam = Number(url.searchParams.get("trainer_member_id")) || 0;

  let query = supabase
    .from("crm_reservations")
    .select(
      "id, member_id, trainer_member_id, starts_at, status, cancelled_reason, cancelled_at, cancelled_by_uid"
    )
    .eq("center_id", ctx.centerId)
    .in("status", ["cancelled", "noshow"])
    .gte("starts_at", `${from}T00:00:00+09:00`)
    .lt("starts_at", `${nextDay}T00:00:00+09:00`)
    .order("starts_at", { ascending: false })
    .limit(2000);

  // 데이터 격리: trainer/manager 는 본인 담당만
  if (ctx.role === "trainer" || ctx.role === "manager") {
    query = query.eq("trainer_member_id", ctx.centerMemberId);
  } else if (trainerParam) {
    query = query.eq("trainer_member_id", trainerParam);
  }

  const { data: rows, error } = await query;
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  const reservations = rows ?? [];

  // 회원 이름 매핑
  const memberIds = Array.from(new Set(reservations.map((r) => r.member_id).filter(Boolean)));
  const memberMap = new Map<number, string>();
  if (memberIds.length > 0) {
    const { data: members } = await supabase
      .from("crm_members")
      .select("id, name")
      .eq("center_id", ctx.centerId)
      .in("id", memberIds);
    for (const m of members ?? []) memberMap.set(m.id, m.name);
  }

  // 사유별 집계
  const byReason = { trainer: 0, member: 0, other: 0 };
  for (const r of reservations) {
    const reason = (r.cancelled_reason ?? "").trim();
    if (reason === "강사 요청") byReason.trainer += 1;
    else if (reason === "회원 요청") byReason.member += 1;
    else byReason.other += 1;
  }

  const log = reservations.map((r) => ({
    id: r.id,
    member_id: r.member_id,
    member_name: memberMap.get(r.member_id) ?? "회원",
    starts_at: r.starts_at,
    status: r.status,
    cancelled_reason: (r.cancelled_reason ?? "").trim() || null,
    cancelled_at: r.cancelled_at,
  }));

  return NextResponse.json({
    total: reservations.length,
    cancelled: reservations.filter((r) => r.status === "cancelled").length,
    noshow: reservations.filter((r) => r.status === "noshow").length,
    by_reason: byReason,
    log,
  });
}
