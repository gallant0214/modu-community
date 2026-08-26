import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { cached, crmCacheKey } from "@/app/lib/cache";

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
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  const ymd = /^\d{4}-\d{2}-\d{2}$/;

  // 직접 선택 (from/to) 이 유효하면 그 범위 사용, 아니면 ym 기반 월단위
  const isRange =
    ymd.test(fromRaw || "") && ymd.test(toRaw || "") && (toRaw as string) >= (fromRaw as string);

  const ym = /^\d{4}-\d{2}$/.test(ymRaw || "")
    ? (ymRaw as string)
    : new Date().toISOString().slice(0, 7);

  let startDate: string;
  let endExclusive: string; // exclusive upper bound (YYYY-MM-DD)
  if (isRange) {
    startDate = fromRaw as string;
    const to = new Date(`${toRaw}T00:00:00Z`);
    to.setUTCDate(to.getUTCDate() + 1);
    endExclusive = to.toISOString().slice(0, 10);
  } else {
    const [y, m] = ym.split("-").map(Number);
    startDate = `${ym}-01`;
    endExclusive = new Date(y, m, 1).toISOString().slice(0, 10);
  }
  const nextMonth = endExclusive; // 기존 변수명 유지 (하위 쿼리 참조)

  // 강사별 매출/수업 집계는 무겁고 초 단위로 안 바뀜 → 60초 캐시.
  // 키에 role·centerMemberId 포함(강사/매니저는 본인 데이터만 보므로 스코프별 분리).
  const cacheKey = crmCacheKey(
    ctx,
    "stats:monthly",
    isRange ? `r:${startDate}:${nextMonth}` : ym,
  );
  const payload = await cached(cacheKey, 60, async () => {
  // 회원 수 — 서버측 member_type != 'matched' 필터 + count(exact) 로 1000행 상한 우회
  let memberQuery = supabase
    .from("crm_members")
    .select("id", { count: "exact", head: true })
    .eq("center_id", ctx.centerId)
    .neq("member_type", "matched")
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

  let membershipQuery = supabase
    .from("crm_memberships")
    .select("id, seller_member_id, price_won, payment_method, start_date, status")
    .eq("center_id", ctx.centerId)
    .neq("status", "deleted")
    .gte("start_date", startDate)
    .lt("start_date", nextMonth);

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
    membershipQuery = membershipQuery.eq("seller_member_id", ctx.centerMemberId);
    resQuery = resQuery.eq("trainer_member_id", ctx.centerMemberId);
    // 회원은 본인 담당만 — 단 trainer 가 직접 가입시킨 회원 추적 안 함. 본인 회원수는 0 표시.
    memberQuery = memberQuery.eq("id", -1); // empty
  }

  // 재직중인 강사 전체 (매출·예약 0건이어도 표에 표시하기 위해)
  // owner/admin 도 PT 진행/판매 담당 가능 → 4개 역할 전부 포함 (스케줄 페이지와 동일)
  let activeStaffQuery = supabase
    .from("crm_center_members")
    .select("id, display_name, role, status")
    .eq("center_id", ctx.centerId)
    .eq("status", "active")
    .in("role", ["owner", "admin", "manager", "trainer"]);

  if (ctx.role === "trainer" || ctx.role === "manager") {
    activeStaffQuery = activeStaffQuery.eq("id", ctx.centerMemberId);
  }

  const [
    { count: memberCount },
    { data: passes },
    { data: memberships },
    { data: reservations },
    { data: activeStaff },
  ] = await Promise.all([memberQuery, passQuery, membershipQuery, resQuery, activeStaffQuery]);

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

  // 재직 강사부터 seed (매출 0인 강사도 표시)
  (activeStaff ?? []).forEach((s) => {
    addTrainer(s.id);
  });

  (passes ?? []).forEach((p) => {
    if (!p.trainer_member_id) return; // 담당 강사 미배정 수강권은 강사별 집계 제외
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
  // 레슨(수강권) 회원 수 — 기간 내 수강권 발급받은 고유 회원 수
  const lessonMemberCount = new Set(
    (passes ?? []).map((p) => p.member_id).filter((v): v is number => !!v)
  ).size;

  // 결제수단 분포
  const paymentBreakdown: Record<string, number> = {};
  (passes ?? []).forEach((p) => {
    const k = p.payment_method ?? "etc";
    paymentBreakdown[k] = (paymentBreakdown[k] ?? 0) + (p.price_won ?? 0);
  });
  (memberships ?? []).forEach((m) => {
    const k = m.payment_method ?? "etc";
    paymentBreakdown[k] = (paymentBreakdown[k] ?? 0) + (m.price_won ?? 0);
  });

  // 직원 이름 join — activeStaff 로 우선 채우고 나머지(퇴사자 등)만 추가 조회
  const staffMap = new Map<number, { name: string; role: string }>();
  (activeStaff ?? []).forEach((s) => {
    staffMap.set(s.id, { name: s.display_name, role: s.role });
  });
  const missingIds = Array.from(trainerStats.keys()).filter((id) => !staffMap.has(id));
  if (missingIds.length) {
    const { data: extraRows } = await supabase
      .from("crm_center_members")
      .select("id, display_name, role")
      .in("id", missingIds);
    (extraRows ?? []).forEach((s) => {
      staffMap.set(s.id, { name: s.display_name, role: s.role });
    });
  }

  return {
    ym,
    range: isRange ? { from: startDate, to: toRaw } : null,
    summary: {
      // memberQuery 에 이미 member_type != 'matched' 반영. count(exact) 는 1000행 상한 무관.
      newMembers: memberCount ?? 0,
      memberCount: memberCount ?? 0,
      lessonMemberCount,
      totalRevenue,
      totalPassCount,
    },
    paymentBreakdown,
    trainers: Array.from(trainerStats.entries())
      .map(([id, s]) => ({
        trainerMemberId: id,
        name: staffMap.get(id)?.name ?? `직원 #${id}`,
        role: staffMap.get(id)?.role ?? "trainer",
        ...s,
      }))
      // 역할별 → 매출 많은 순 → 이름 순 (owner 를 최상단)
      .sort((a, b) => {
        const roleOrder = { owner: 0, admin: 1, manager: 2, trainer: 3 } as Record<string, number>;
        const ra = roleOrder[a.role] ?? 9;
        const rb = roleOrder[b.role] ?? 9;
        if (ra !== rb) return ra - rb;
        if (b.passes.revenue !== a.passes.revenue) return b.passes.revenue - a.passes.revenue;
        return a.name.localeCompare(b.name, "ko");
      }),
  };
  });

  return NextResponse.json(payload);
}
