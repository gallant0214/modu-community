import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/stats/monthly?ym=YYYY-MM
 * 월별 요약:
 *   - 등록 회원수 (해당 월에 created 된 crm_members)
 *   - PT매출 (해당 월에 issued_at 인 crm_passes 합계)
 *   - 결제수단 분포
 *   - 강사별 신규/재등록/체험 카운트 + 매출
 *   - 강사별 출석완료/취소 카운트
 *
 * trainer/manager 는 본인 데이터만.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const ymRaw = url.searchParams.get("ym");
  const ym = /^\d{4}-\d{2}$/.test(ymRaw || "")
    ? (ymRaw as string)
    : new Date().toISOString().slice(0, 7);

  const [y, m] = ym.split("-").map(Number);
  const startDate = `${ym}-01`;
  const nextMonth = new Date(y, m, 1).toISOString().slice(0, 10);

  // 회원 수
  let memberQuery = supabase
    .from("crm_members")
    .select("id, created_at, member_type", { count: "exact" })
    .eq("center_id", ctx.centerId)
    .gte("created_at", `${startDate}T00:00:00+09:00`)
    .lt("created_at", `${nextMonth}T00:00:00+09:00`);

  // 수강권 (해당 월 발급)
  let passQuery = supabase
    .from("crm_passes")
    .select(
      "id, member_id, trainer_member_id, seller_member_id, issue_type, price_won, payment_method, issued_at, status"
    )
    .eq("center_id", ctx.centerId)
    .gte("issued_at", startDate)
    .lt("issued_at", nextMonth);

  // 예약 (해당 월 attended 기준)
  let resQuery = supabase
    .from("crm_reservations")
    .select("id, trainer_member_id, status, consumed, attended_at, starts_at")
    .eq("center_id", ctx.centerId)
    .gte("starts_at", `${startDate}T00:00:00+09:00`)
    .lt("starts_at", `${nextMonth}T00:00:00+09:00`);

  if (ctx.role === "trainer" || ctx.role === "manager") {
    passQuery = passQuery.or(
      `trainer_member_id.eq.${ctx.centerMemberId},seller_member_id.eq.${ctx.centerMemberId}`
    );
    resQuery = resQuery.eq("trainer_member_id", ctx.centerMemberId);
    // 회원은 본인 담당만 — 단 trainer 가 직접 가입시킨 회원 추적 안 함. 본인 회원수는 0 표시.
    memberQuery = memberQuery.eq("id", -1); // empty
  }

  const [{ data: members, count: memberCount }, { data: passes }, { data: reservations }] = await Promise.all([
    memberQuery,
    passQuery,
    resQuery,
  ]);

  // 강사별 집계
  const trainerStats = new Map<
    number,
    {
      passes: { new: number; renewal: number; trial: number; service: number; total: number; revenue: number };
      reservations: { attended: number; cancelled: number; noshow: number; booked: number };
    }
  >();
  const addTrainer = (id: number) => {
    if (!trainerStats.has(id)) {
      trainerStats.set(id, {
        passes: { new: 0, renewal: 0, trial: 0, service: 0, total: 0, revenue: 0 },
        reservations: { attended: 0, cancelled: 0, noshow: 0, booked: 0 },
      });
    }
    return trainerStats.get(id)!;
  };

  (passes ?? []).forEach((p) => {
    const t = addTrainer(p.trainer_member_id);
    t.passes.total += 1;
    t.passes.revenue += p.price_won ?? 0;
    if (p.issue_type === "new") t.passes.new += 1;
    else if (p.issue_type === "renewal") t.passes.renewal += 1;
    else if (p.issue_type === "trial") t.passes.trial += 1;
    else if (p.issue_type === "service") t.passes.service += 1;
  });
  (reservations ?? []).forEach((r) => {
    const t = addTrainer(r.trainer_member_id);
    const s = r.status as keyof typeof t.reservations;
    if (s in t.reservations) t.reservations[s] += 1;
  });

  const totalRevenue = (passes ?? []).reduce((s, p) => s + (p.price_won ?? 0), 0);
  const totalPassCount = (passes ?? []).length;

  // 결제수단 분포
  const paymentBreakdown: Record<string, number> = {};
  (passes ?? []).forEach((p) => {
    const k = p.payment_method ?? "etc";
    paymentBreakdown[k] = (paymentBreakdown[k] ?? 0) + (p.price_won ?? 0);
  });

  // 직원 이름 join
  const trainerIds = Array.from(trainerStats.keys());
  const { data: staffRows } = trainerIds.length
    ? await supabase
        .from("crm_center_members")
        .select("id, display_name, role")
        .in("id", trainerIds)
    : { data: [] };
  const staffMap = new Map(
    (staffRows ?? []).map((s) => [s.id, { name: s.display_name, role: s.role }])
  );

  return NextResponse.json({
    ym,
    summary: {
      newMembers: (members ?? []).filter((m) => m.member_type !== "matched").length,
      memberCount: memberCount ?? 0,
      totalRevenue,
      totalPassCount,
    },
    paymentBreakdown,
    trainers: Array.from(trainerStats.entries()).map(([id, s]) => ({
      trainerMemberId: id,
      name: staffMap.get(id)?.name ?? `직원 #${id}`,
      role: staffMap.get(id)?.role ?? "trainer",
      ...s,
    })),
  });
}
