/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAdminPassword } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/kpi/crm
 * body: { password, from?: ISO, to?: ISO, center_id?: number }
 *
 * center_id 를 지정하면 해당 센터 스코프의 지표만 반환.
 * 지정 안 하면 전체 플랫폼 통합.
 *
 * 응답:
 *  - scope: 'all' | 'center'
 *  - centers_list: [{id,name,kind}] — 셀렉터용 (전체 센터 목록, 항상 반환)
 *  - selected_center: 선택된 센터 정보 (center_id 지정 시)
 *  - platform: 플랫폼 전체 (센터 수 등 — 언제나 통합)
 *  - overview: 스코프에 따라 필터된 수치
 *  - period_deltas / feature_adoption / growth_daily_30d: 스코프 적용
 *  - top_centers: 전체 스코프일 때만 (center_id 지정 시 null)
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const {
    password,
    from,
    to,
    center_id,
    growth_from,
    growth_to,
  } = body as { password?: string; from?: string; to?: string; center_id?: number; growth_from?: string; growth_to?: string };
  if (!(await verifyAdminPassword(password ?? ""))) {
    return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
  }

  const rangeFrom = typeof from === "string" ? from : null;
  const rangeTo = typeof to === "string" ? to : null;
  const centerId = Number.isFinite(Number(center_id)) && Number(center_id) > 0 ? Number(center_id) : null;
  const scoped = (q: any) => (centerId ? q.eq("center_id", centerId) : q);

  // 플랫폼 전체 통계 (센터 수 등 — 언제나 통합)
  const [
    centersTotal,
    soloCenters,
    activeCentersRow,
    activeCentersRecent,
  ] = await Promise.all([
    countAll("crm_centers"),
    countWhere("crm_centers", (q) => q.eq("kind", "solo")),
    countWhere("crm_centers", (q) => q.eq("status", "active")),
    countDistinctRecentCenters(),
  ]);

  // 스코프별 통계
  const [
    centerMembers,
    members,
    memberships,
    passes,
    rentals,
    reservations,
    attendances,
    consultations,
    consultationTemplates,
    sales,
    contracts,
    linkedMembers,
    matchedMembers,
    provisionalMembers,
    activeMembers,
    activeMemberships,
    activePasses,
    convertedConsultations,
    faceRegistered,
    reservationsWithSourceApp,
    attendancesTouch,
  ] = await Promise.all([
    countWhere("crm_center_members", (q) => scoped(q)),
    countWhere("crm_members", (q) => scoped(q)),
    countWhere("crm_memberships", (q) => scoped(q)),
    countWhere("crm_passes", (q) => scoped(q)),
    countWhere("crm_rentals", (q) => scoped(q)),
    countWhere("crm_reservations", (q) => scoped(q)),
    countWhere("crm_attendances", (q) => scoped(q)),
    countWhere("crm_pt_consultations", (q) => scoped(q)),
    countWhere("crm_consultation_templates", (q) => scoped(q)),
    countWhere("crm_sales", (q) => scoped(q)),
    countWhere("crm_signed_contracts", (q) => scoped(q)).catch(() => 0),
    countWhere("crm_members", (q) => scoped(q).not("linked_firebase_uid", "is", null)),
    countWhere("crm_members", (q) => scoped(q).eq("member_type", "matched")),
    countWhere("crm_members", (q) => scoped(q).eq("member_type", "provisional")),
    countWhere("crm_members", (q) => scoped(q).eq("status", "active")),
    countWhere("crm_memberships", (q) =>
      scoped(q).eq("status", "valid").gte("expires_at", todayYmd())
    ),
    countWhere("crm_passes", (q) =>
      scoped(q).eq("status", "valid").gte("expires_at", todayYmd())
    ),
    countWhere("crm_pt_consultations", (q) => scoped(q).eq("status", "converted")),
    countWhere("crm_members", (q) => scoped(q).not("face_image_data", "is", null)),
    countWhere("crm_reservations", (q) => scoped(q).eq("source", "app")).catch(() => 0),
    countWhere("crm_attendances", (q) => scoped(q).eq("source", "touch")).catch(() => 0),
  ]);

  // 자동 메세지: 활성화된 트리거를 하나라도 가진 센터 수 (전체) / 선택 센터가 활성화 했는지 (개별)
  const autoMessageValue = centerId
    ? await (async () => {
        const has = await countWhere("crm_auto_message_settings", (q) =>
          scoped(q).eq("enabled", true)
        ).catch(() => 0);
        return has > 0 ? 1 : 0;
      })()
    : await distinctCentersWith("crm_auto_message_settings", (q) =>
        q.eq("enabled", true)
      ).catch(() => 0);

  // 기간 델타
  const period = rangeFrom && rangeTo
    ? await buildPeriodDeltas(rangeFrom, rangeTo, centerId)
    : null;

  // 상위 센터는 전체 스코프일 때만
  let topCentersOut: any = null;
  const centerNames = await allCenterNames();
  if (!centerId) {
    const [topByMembers, topByRecentAttend, topByRevenue] = await Promise.all([
      topCenters("crm_members", 5),
      topActiveCenters(30, 5),
      topRevenueCenters(30, 5),
    ]);
    topCentersOut = {
      by_members: joinCenterNames(topByMembers, centerNames),
      by_recent_activity: joinCenterNames(topByRecentAttend, centerNames),
      by_recent_revenue: joinCenterNames(topByRevenue, centerNames),
    };
  }

  // 일별 성장 (기간 지정 가능, 기본 최근 30일. 센터 필터 시 센터 신규 유입 열은 제외)
  const gFrom = typeof growth_from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(growth_from) ? growth_from : null;
  const gTo = typeof growth_to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(growth_to) ? growth_to : null;
  const growth = await growthDaily(centerId, gFrom, gTo);

  const centersList = [...centerNames.entries()].map(([id, v]) => ({
    id,
    name: v.name,
    kind: v.kind,
  }));

  return NextResponse.json({
    scope: centerId ? "center" : "all",
    selected_center: centerId
      ? { id: centerId, ...(centerNames.get(centerId) ?? { name: `#${centerId}`, kind: "center" }) }
      : null,
    centers_list: centersList,
    platform: {
      centers_total: centersTotal,
      centers_solo: soloCenters,
      centers_multi: centersTotal - soloCenters,
      centers_active: activeCentersRow,
      centers_recently_active: activeCentersRecent,
    },
    overview: {
      staff_total: centerMembers,
      members_total: members,
      members_linked: linkedMembers,
      members_matched: matchedMembers,
      members_provisional: provisionalMembers,
      members_active: activeMembers,
      memberships_total: memberships,
      memberships_active: activeMemberships,
      passes_total: passes,
      passes_active: activePasses,
      rentals_total: rentals,
      reservations_total: reservations,
      attendances_total: attendances,
      consultations_total: consultations,
      consultations_converted: convertedConsultations,
      consultation_templates_total: consultationTemplates,
      sales_rows_total: sales,
      contracts_total: contracts,
    },
    feature_adoption: {
      face_registered_members: faceRegistered,
      touch_attendance_events: attendancesTouch,
      app_reservations: reservationsWithSourceApp,
      // 전체 스코프에선 '활성 센터 수', 개별 스코프에선 0/1
      auto_message_enabled_centers: autoMessageValue,
      auto_message_label: centerId ? "자동 메세지 사용 여부" : "자동 메세지 활성 센터 수",
    },
    period_deltas: period,
    period,
    top_centers: topCentersOut,
    growth_daily_30d: growth,
  });
}

/* ─── helpers ───────────────────────────────────── */

async function countAll(table: string): Promise<number> {
  const { count } = await (supabase as any)
    .from(table)
    .select("id", { head: true, count: "exact" });
  return count ?? 0;
}

async function countWhere(
  table: string,
  filter: (q: any) => any
): Promise<number> {
  const base = (supabase as any).from(table).select("id", { head: true, count: "exact" });
  const { count } = await filter(base);
  return count ?? 0;
}

async function distinctCentersWith(
  table: string,
  filter: (q: any) => any
): Promise<number> {
  const set = new Set<number>();
  const PAGE = 1000;
  for (let p = 0; p < 50; p++) {
    const base = (supabase as any).from(table).select("center_id");
    const { data } = await filter(base).range(p * PAGE, p * PAGE + PAGE - 1);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const cid = (r as any).center_id as number;
      if (cid) set.add(cid);
    }
    if (data.length < PAGE) break;
  }
  return set.size;
}

function todayYmd(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

async function buildPeriodDeltas(fromIso: string, toIso: string, centerId: number | null) {
  const from = new Date(fromIso).toISOString();
  const to = new Date(toIso).toISOString();
  const scoped = (q: any) => (centerId ? q.eq("center_id", centerId) : q);
  const inRange = (table: string, dateCol: string) => async () =>
    countWhere(table, (q) => scoped(q).gte(dateCol, from).lte(dateCol, to));

  const [
    newCenters,
    newStaff,
    newMembers,
    newLinkedMembers,
    newMemberships,
    newPasses,
    newRentals,
    newReservations,
    newAttendances,
    newConsultations,
    newContracts,
  ] = await Promise.all([
    // 플랫폼 전체 지표: 센터 필터 무관하게 항상 전체
    centerId
      ? Promise.resolve(0)
      : countWhere("crm_centers", (q) => q.gte("created_at", from).lte("created_at", to)),
    inRange("crm_center_members", "created_at")(),
    inRange("crm_members", "created_at")(),
    countWhere("crm_members", (q) =>
      scoped(q).gte("created_at", from).lte("created_at", to).not("linked_firebase_uid", "is", null)
    ),
    inRange("crm_memberships", "created_at")(),
    inRange("crm_passes", "created_at")(),
    inRange("crm_rentals", "created_at")(),
    inRange("crm_reservations", "created_at")(),
    inRange("crm_attendances", "checked_in_at")(),
    inRange("crm_pt_consultations", "created_at")(),
    countWhere("crm_signed_contracts", (q) =>
      scoped(q).gte("created_at", from).lte("created_at", to)
    ).catch(() => 0),
  ]);

  // 기간 내 매출액 (crm_sales 원장) — 센터 필터 반영
  const salesSum = await sumSales(from, to, centerId);

  return {
    from,
    to,
    new_centers: newCenters,
    new_staff: newStaff,
    new_members: newMembers,
    new_members_linked: newLinkedMembers,
    new_memberships: newMemberships,
    new_passes: newPasses,
    new_rentals: newRentals,
    new_reservations: newReservations,
    new_attendances: newAttendances,
    new_consultations: newConsultations,
    new_contracts: newContracts,
    sales_amount: salesSum,
  };
}

async function sumSales(fromIso: string, toIso: string, centerId: number | null): Promise<number> {
  let total = 0;
  const PAGE = 1000;
  for (let p = 0; p < 200; p++) {
    let q = (supabase as any)
      .from("crm_sales")
      .select("amount_won")
      .gte("tx_at", fromIso)
      .lte("tx_at", toIso);
    if (centerId) q = q.eq("center_id", centerId);
    const { data } = await q.range(p * PAGE, p * PAGE + PAGE - 1);
    if (!data || data.length === 0) break;
    for (const r of data) total += Number((r as any).amount_won) || 0;
    if (data.length < PAGE) break;
  }
  return total;
}

async function topCenters(
  table: string,
  limit: number
): Promise<{ center_id: number; count: number }[]> {
  const PAGE = 1000;
  const map = new Map<number, number>();
  for (let p = 0; p < 200; p++) {
    const { data } = await (supabase as any)
      .from(table)
      .select("center_id")
      .range(p * PAGE, p * PAGE + PAGE - 1);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const cid = (r as any).center_id as number;
      if (!cid) continue;
      map.set(cid, (map.get(cid) ?? 0) + 1);
    }
    if (data.length < PAGE) break;
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([center_id, count]) => ({ center_id, count }));
}

async function topActiveCenters(
  daysBack: number,
  limit: number
): Promise<{ center_id: number; count: number }[]> {
  const since = new Date(Date.now() - daysBack * 86400000).toISOString();
  const PAGE = 1000;
  const map = new Map<number, number>();
  for (let p = 0; p < 200; p++) {
    const { data } = await (supabase as any)
      .from("crm_attendances")
      .select("center_id")
      .gte("checked_in_at", since)
      .range(p * PAGE, p * PAGE + PAGE - 1);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const cid = (r as any).center_id as number;
      if (!cid) continue;
      map.set(cid, (map.get(cid) ?? 0) + 1);
    }
    if (data.length < PAGE) break;
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([center_id, count]) => ({ center_id, count }));
}

async function topRevenueCenters(
  daysBack: number,
  limit: number
): Promise<{ center_id: number; count: number }[]> {
  const since = new Date(Date.now() - daysBack * 86400000).toISOString();
  const PAGE = 1000;
  const map = new Map<number, number>();
  for (let p = 0; p < 200; p++) {
    const { data } = await (supabase as any)
      .from("crm_sales")
      .select("center_id, amount_won")
      .gte("tx_at", since)
      .range(p * PAGE, p * PAGE + PAGE - 1);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const cid = (r as any).center_id as number;
      const amt = Number((r as any).amount_won) || 0;
      if (!cid) continue;
      map.set(cid, (map.get(cid) ?? 0) + amt);
    }
    if (data.length < PAGE) break;
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([center_id, count]) => ({ center_id, count }));
}

async function countDistinctRecentCenters(): Promise<number> {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const set = new Set<number>();
  const PAGE = 1000;
  for (let p = 0; p < 100; p++) {
    const { data } = await (supabase as any)
      .from("crm_attendances")
      .select("center_id")
      .gte("checked_in_at", since)
      .range(p * PAGE, p * PAGE + PAGE - 1);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const cid = (r as any).center_id as number;
      if (cid) set.add(cid);
    }
    if (data.length < PAGE) break;
  }
  return set.size;
}

async function allCenterNames(): Promise<Map<number, { name: string; kind: string }>> {
  const map = new Map<number, { name: string; kind: string }>();
  const { data } = await (supabase as any)
    .from("crm_centers")
    .select("id, name, kind")
    .order("name", { ascending: true })
    .range(0, 999);
  for (const r of data ?? []) {
    map.set((r as any).id, { name: (r as any).name, kind: (r as any).kind });
  }
  return map;
}

function joinCenterNames(
  rows: { center_id: number; count: number }[],
  map: Map<number, { name: string; kind: string }>
) {
  return rows.map((r) => ({
    center_id: r.center_id,
    count: r.count,
    name: map.get(r.center_id)?.name ?? `#${r.center_id}`,
    kind: map.get(r.center_id)?.kind ?? "center",
  }));
}

async function growthDaily(
  centerId: number | null,
  fromYmd?: string | null,
  toYmd?: string | null
): Promise<{ date: string; centers: number; members: number; consultations: number; passes: number; attendances: number; sales_amount: number }[]> {
  const dateKey = (iso: string): string => {
    return new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  };
  const addDays = (ymd: string, n: number): string =>
    new Date(new Date(`${ymd}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

  // 기간 결정 (KST). 미지정 시 최근 30일. from>to 면 스왑, 최대 400일 제한.
  const kstToday = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  let to = /^\d{4}-\d{2}-\d{2}$/.test(toYmd ?? "") ? (toYmd as string) : kstToday;
  let from = /^\d{4}-\d{2}-\d{2}$/.test(fromYmd ?? "") ? (fromYmd as string) : addDays(to, -29);
  if (from > to) [from, to] = [to, from];
  // 날짜 리스트 (최대 400일)
  const dayList: string[] = [];
  for (let cur = from, i = 0; cur <= to && i < 400; cur = addDays(cur, 1), i++) dayList.push(cur);
  const lastDay = dayList[dayList.length - 1] ?? to;
  const startIso = new Date(`${from}T00:00:00+09:00`).toISOString();
  const endIso = new Date(`${addDays(lastDay, 1)}T00:00:00+09:00`).toISOString(); // 배타적 상한

  const collect = async (
    table: string,
    dateCol: string,
    applyScope = true,
    valueCol?: string
  ): Promise<Map<string, number>> => {
    const acc = new Map<string, number>();
    const PAGE = 1000;
    for (let p = 0; p < 100; p++) {
      let q = (supabase as any)
        .from(table)
        .select(valueCol ? `${dateCol}, ${valueCol}` : dateCol)
        .gte(dateCol, startIso)
        .lt(dateCol, endIso);
      if (applyScope && centerId) q = q.eq("center_id", centerId);
      const { data } = await q.range(p * PAGE, p * PAGE + PAGE - 1);
      if (!data || data.length === 0) break;
      for (const r of data) {
        const k = dateKey((r as any)[dateCol]);
        const inc = valueCol ? Number((r as any)[valueCol]) || 0 : 1;
        acc.set(k, (acc.get(k) ?? 0) + inc);
      }
      if (data.length < PAGE) break;
    }
    return acc;
  };

  // 신규 센터는 항상 플랫폼 전체 (센터별 필터에선 0 으로 표시)
  const [centersMap, membersMap, consMap, passesMap, attendMap, salesMap] = await Promise.all([
    centerId ? Promise.resolve(new Map<string, number>()) : collect("crm_centers", "created_at", false),
    collect("crm_members", "created_at"),
    collect("crm_pt_consultations", "created_at"),
    collect("crm_passes", "created_at"),
    collect("crm_attendances", "checked_in_at"),
    collect("crm_sales", "tx_at", true, "amount_won"),
  ]);

  const out: { date: string; centers: number; members: number; consultations: number; passes: number; attendances: number; sales_amount: number }[] = [];
  for (const key of dayList) {
    out.push({
      date: key,
      centers: centersMap.get(key) ?? 0,
      members: membersMap.get(key) ?? 0,
      consultations: consMap.get(key) ?? 0,
      passes: passesMap.get(key) ?? 0,
      attendances: attendMap.get(key) ?? 0,
      sales_amount: salesMap.get(key) ?? 0,
    });
  }
  return out;
}
