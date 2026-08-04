/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAdminPassword } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/kpi/crm
 * body: { password, from?: ISO, to?: ISO }
 *
 * 관리자용 CRM 종합 현황.
 *  - overview: 센터 수(kind 별), 직원/강사 수, 회원 수(연동/미연동), 이용권 수 등
 *  - period_deltas: 선택 기간 내 신규 센터/신규 회원/신규 발급/출석/예약/상담 수
 *  - feature_adoption: 얼굴 등록, 상담지 사용, 자동 알림 활성 센터 수 등
 *  - top_centers: 회원 수 · 최근 30일 활동 상위 5센터
 *  - growth_daily_30d: 최근 30일 일별 센터/회원 신규 유입 (전체 기준)
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { password, from, to } = body as { password?: string; from?: string; to?: string };
  if (!(await verifyAdminPassword(password ?? ""))) {
    return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
  }

  const rangeFrom = typeof from === "string" ? from : null;
  const rangeTo = typeof to === "string" ? to : null;

  const [
    centers,
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
  ] = await Promise.all([
    countAll("crm_centers"),
    countAll("crm_center_members"),
    countAll("crm_members"),
    countAll("crm_memberships"),
    countAll("crm_passes"),
    countAll("crm_rentals"),
    countAll("crm_reservations"),
    countAll("crm_attendances"),
    countAll("crm_pt_consultations"),
    countAll("crm_consultation_templates"),
    countAll("crm_sales"),
    countAll("crm_signed_contracts").catch(() => 0),
  ]);

  // 세분화 카운트
  const [
    soloCenters,
    activeCentersRow,
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
    // 최근 30일 활동(출석 or 예약 or 상담)이 있는 센터 수
    activeCentersRecent,
  ] = await Promise.all([
    countWhere("crm_centers", (q) => q.eq("kind", "solo")),
    countWhere("crm_centers", (q) => q.eq("status", "active")),
    countWhere("crm_members", (q) => q.not("linked_firebase_uid", "is", null)),
    countWhere("crm_members", (q) => q.eq("member_type", "matched")),
    countWhere("crm_members", (q) => q.eq("member_type", "provisional")),
    countWhere("crm_members", (q) => q.eq("status", "active")),
    countWhere("crm_memberships", (q) =>
      q.eq("status", "valid").gte("expires_at", todayYmd())
    ),
    countWhere("crm_passes", (q) => q.eq("status", "valid").gte("expires_at", todayYmd())),
    countWhere("crm_pt_consultations", (q) => q.eq("status", "converted")),
    countWhere("crm_members", (q) => q.not("face_image_data", "is", null)),
    countWhere("crm_reservations", (q) => q.eq("source", "app")).catch(() => 0),
    countWhere("crm_attendances", (q) => q.eq("source", "touch")).catch(() => 0),
    countDistinctRecentCenters(),
  ]);

  // 자동 메세지: 활성화된 트리거를 하나라도 가진 센터 수
  const autoMessageCenters = await distinctCentersWith(
    "crm_auto_message_settings",
    (q) => q.eq("enabled", true)
  ).catch(() => 0);

  // 기간 델타 (선택된 기간에 해당하는 새 레코드 수)
  const period = rangeFrom && rangeTo
    ? await buildPeriodDeltas(rangeFrom, rangeTo)
    : null;

  // 상위 센터 (회원 수 기준 · 최근 30일 출석 기준)
  const [topByMembers, topByRecentAttend] = await Promise.all([
    topCenters("crm_members", "member_id", 5),
    topActiveCenters(30, 5),
  ]);

  // 최근 30일 일별 성장 (신규 센터 · 신규 회원 · 신규 발급 · 신규 상담)
  const growth = await growthDaily(30);

  // 컨텍스트 (센터 이름 join용)
  const centerNames = await allCenterNames();

  return NextResponse.json({
    overview: {
      centers_total: centers,
      centers_solo: soloCenters,
      centers_multi: centers - soloCenters,
      centers_active: activeCentersRow,
      centers_recently_active: activeCentersRecent,
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
      auto_message_enabled_centers: autoMessageCenters,
    },
    period_deltas: period,
    period,
    top_centers: {
      by_members: joinCenterNames(topByMembers, centerNames),
      by_recent_activity: joinCenterNames(topByRecentAttend, centerNames),
    },
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

async function buildPeriodDeltas(fromIso: string, toIso: string) {
  const from = new Date(fromIso).toISOString();
  const to = new Date(toIso).toISOString();
  const inRange = (table: string, dateCol: string) => async () =>
    countWhere(table, (q) => q.gte(dateCol, from).lte(dateCol, to));

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
    inRange("crm_centers", "created_at")(),
    inRange("crm_center_members", "created_at")(),
    inRange("crm_members", "created_at")(),
    countWhere("crm_members", (q) =>
      q.gte("created_at", from).lte("created_at", to).not("linked_firebase_uid", "is", null)
    ),
    inRange("crm_memberships", "created_at")(),
    inRange("crm_passes", "created_at")(),
    inRange("crm_rentals", "created_at")(),
    inRange("crm_reservations", "created_at")(),
    inRange("crm_attendances", "checked_in_at")(),
    inRange("crm_pt_consultations", "created_at")(),
    countWhere("crm_signed_contracts", (q) =>
      q.gte("created_at", from).lte("created_at", to)
    ).catch(() => 0),
  ]);

  // 기간 내 매출액 (crm_sales 원장)
  const salesSum = await sumSales(from, to);

  return {
    from,
    to,
    new_centers: newCenters,
    new_staff: newStaff,
    new_members: newMembers,
    new_members_linked: newLinkedMembers, // 회원앱 셀프 가입
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

async function sumSales(fromIso: string, toIso: string): Promise<number> {
  let total = 0;
  const PAGE = 1000;
  for (let p = 0; p < 200; p++) {
    const { data } = await (supabase as any)
      .from("crm_sales")
      .select("amount_won")
      .gte("tx_at", fromIso)
      .lte("tx_at", toIso)
      .range(p * PAGE, p * PAGE + PAGE - 1);
    if (!data || data.length === 0) break;
    for (const r of data) total += Number((r as any).amount_won) || 0;
    if (data.length < PAGE) break;
  }
  return total;
}

async function topCenters(
  table: string,
  _keyCol: string,
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
  days: number
): Promise<{ date: string; centers: number; members: number; consultations: number; passes: number }[]> {
  const now = new Date();
  const startUtc = new Date(
    new Date(now.getTime() + 9 * 3600 * 1000).setUTCHours(0, 0, 0, 0) - (days - 1) * 86400000 - 9 * 3600 * 1000
  );
  const startIso = startUtc.toISOString();

  const dateKey = (iso: string): string => {
    return new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  };

  const collect = async (table: string, dateCol: string): Promise<Map<string, number>> => {
    const acc = new Map<string, number>();
    const PAGE = 1000;
    for (let p = 0; p < 100; p++) {
      const { data } = await (supabase as any)
        .from(table)
        .select(dateCol)
        .gte(dateCol, startIso)
        .range(p * PAGE, p * PAGE + PAGE - 1);
      if (!data || data.length === 0) break;
      for (const r of data) {
        const k = dateKey((r as any)[dateCol]);
        acc.set(k, (acc.get(k) ?? 0) + 1);
      }
      if (data.length < PAGE) break;
    }
    return acc;
  };

  const [centersMap, membersMap, consMap, passesMap] = await Promise.all([
    collect("crm_centers", "created_at"),
    collect("crm_members", "created_at"),
    collect("crm_pt_consultations", "created_at"),
    collect("crm_passes", "created_at"),
  ]);

  const out: { date: string; centers: number; members: number; consultations: number; passes: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(
      new Date(now.getTime() + 9 * 3600 * 1000).setUTCHours(0, 0, 0, 0) - (days - 1 - i) * 86400000 - 9 * 3600 * 1000
    );
    const key = dateKey(d.toISOString());
    out.push({
      date: key,
      centers: centersMap.get(key) ?? 0,
      members: membersMap.get(key) ?? 0,
      consultations: consMap.get(key) ?? 0,
      passes: passesMap.get(key) ?? 0,
    });
  }
  return out;
}
