import { errDetail } from "@/app/lib/api-error";
import { NextResponse } from "next/server";
import { escapePostgrestQuery } from "@/app/lib/security";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { lockerQuotaMap } from "@/app/lib/crm-locker-quota";
import { looksLikeLockerRental } from "@/app/lib/crm-locker-sync";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/lockers/unassigned-members?q=
 *
 * **락커 배정이 가능한 회원** 목록 — 유효한 락커 이용권 수가 현재 배정 수보다 많은 회원.
 * 자리를 못 받은 락커 이용권(구매 상품)·시작일·만료일·결제 일시 함께 반환(locker_rentals).
 *
 * 🚨 2026-10-09 변경: 예전엔 '락커가 없는 모든 활성 회원' 을 돌려줘서
 *    ① 이용권 없는 회원도 검색돼 배정됐고(락커가 이용권 없이 생김)
 *    ② 이용권 2개인 회원은 이미 1개 배정됐다는 이유로 검색에서 빠졌다.
 *    → 이용권 보유 수 기준(crm-locker-quota)으로 교체. 응답에 locker_quota 포함.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  // 🚨 .or() 필터 문자열에 그대로 들어간다 — 쉼표·괄호를 지우지 않으면 조건을 끼워 넣을 수 있다
  const q = escapePostgrestQuery(url.searchParams.get("q") || "");

  // 락커 이용권 여유가 있는 회원만 대상 (이용권 수 > 배정 수)
  const quotaMap = await lockerQuotaMap(ctx.centerId);
  const eligibleIds = Array.from(quotaMap.entries())
    .filter(([, q]) => q.canAssign)
    .map(([id]) => id);
  if (eligibleIds.length === 0) {
    return NextResponse.json({ members: [] });
  }

  let query = supabase
    .from("crm_members")
    .select(
      "id, name, phone, birth, gender, member_type, created_at, linked_firebase_uid"
    )
    .eq("center_id", ctx.centerId)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  query = query.in("id", eligibleIds);
  if (q) {
    query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
  }

  const { data: members, error } = await query.limit(200);
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: errDetail(error) }, { status: 500 });
  }

  // 구매 상품 = 아직 자리를 못 받은 **락커 이용권**(회원권·수강권 아님) + 그 시작일·만료일·결제 일시
  const memberIds = (members ?? []).map((m) => m.id);
  const lockerRentals = await unassignedLockerRentals(ctx.centerId, memberIds);

  return NextResponse.json({
    members: (members ?? []).map((m) => {
      const q = quotaMap.get(m.id);
      return {
        ...m,
        locker_rentals: lockerRentals.get(m.id) ?? [],
        // 락커 이용권 보유/배정 수 — 화면에서 '이용권 2개 중 1개 사용' 안내에 사용
        locker_quota: q ? { rentals: q.rentals, assigned: q.assigned } : null,
      };
    }),
  });
}

type LockerRentalItem = {
  id: number;
  item_name: string;
  start_date: string;
  expires_at: string;
  paid_at: string | null;
};

/**
 * 회원별 '자리를 아직 못 받은' 락커 이용권.
 * 배정 한도(crm-locker-quota)와 같은 기준 — 유효(valid·만료 전) + looksLikeLockerRental.
 * 배정된 락커가 있으면 memo 에 그 자리("구역 N번")가 적힌 이용권은 이미 쓰는 것으로 보고 뺀다.
 * memo 로 못 가르면(같은 자리로 연장 구매 등) 남는 수(이용권 − 배정)만큼 시작일이 늦은 것부터 보여 준다.
 */
async function unassignedLockerRentals(
  centerId: number,
  memberIds: number[]
): Promise<Map<number, LockerRentalItem[]>> {
  const out = new Map<number, LockerRentalItem[]>();
  if (memberIds.length === 0) return out;
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

  const [{ data: rentals }, { data: lockers }] = await Promise.all([
    supabase
      .from("crm_rentals")
      .select("id, member_id, item_name, memo, start_date, expires_at, created_at")
      .eq("center_id", centerId)
      .in("member_id", memberIds)
      .eq("status", "valid")
      .gte("expires_at", today)
      .order("start_date", { ascending: true }),
    supabase
      .from("crm_lockers")
      .select("assigned_member_id, number, zone_id")
      .eq("center_id", centerId)
      .eq("state", "assigned")
      .in("assigned_member_id", memberIds),
  ]);
  type R = {
    id: number;
    member_id: number;
    item_name: string | null;
    memo: string | null;
    start_date: string;
    expires_at: string;
    created_at: string;
  };
  const lockerRows = (rentals ?? []).filter((r) => looksLikeLockerRental(r.item_name, r.memo)) as R[];
  if (lockerRows.length === 0) return out;

  // 배정된 자리 라벨("남자탈의실 14번") — 대여권 memo 와 맞춰 이미 쓰는 이용권을 가린다
  const assigned = (lockers ?? []) as { assigned_member_id: number; number: number; zone_id: number }[];
  const zoneIds = Array.from(new Set(assigned.map((l) => l.zone_id)));
  const { data: zones } = zoneIds.length
    ? await supabase.from("crm_locker_zones").select("id, name").in("id", zoneIds)
    : { data: [] };
  const zoneName = new Map(((zones ?? []) as { id: number; name: string }[]).map((z) => [z.id, z.name]));
  const labelsByMember = new Map<number, string[]>();
  for (const l of assigned) {
    const arr = labelsByMember.get(l.assigned_member_id) ?? [];
    arr.push(`${zoneName.get(l.zone_id) ?? ""} ${l.number}번`);
    labelsByMember.set(l.assigned_member_id, arr);
  }

  // 결제 일시 = 그 이용권에 연결된 결제 시각(가장 이른 것), 없으면 발급 시각
  const { data: pays } = await supabase
    .from("crm_payments")
    .select("rental_id, paid_at")
    .in("rental_id", lockerRows.map((r) => r.id))
    .order("paid_at", { ascending: true });
  const paidAt = new Map<number, string>();
  for (const p of (pays ?? []) as { rental_id: number; paid_at: string | null }[]) {
    if (p.paid_at && !paidAt.has(p.rental_id)) paidAt.set(p.rental_id, p.paid_at);
  }

  const byMember = new Map<number, R[]>();
  for (const r of lockerRows) {
    const arr = byMember.get(r.member_id) ?? [];
    arr.push(r);
    byMember.set(r.member_id, arr);
  }
  for (const [memberId, rs] of byMember) {
    const labels = labelsByMember.get(memberId) ?? [];
    const spare = rs.length - labels.length;
    if (spare <= 0) continue;
    const inUse = (r: R) => labels.some((lb) => (r.memo ?? "").includes(lb));
    const free = rs.filter((r) => !inUse(r));
    // memo 로 덜 가려졌으면 자리 적힌 것 중 시작일이 늦은 것(연장분)부터 채운다
    const picked =
      free.length >= spare
        ? free.slice(0, spare)
        : [...free, ...rs.filter(inUse).slice(-(spare - free.length))];
    out.set(
      memberId,
      picked
        .sort((a, b) => a.start_date.localeCompare(b.start_date))
        .map((r) => ({
          id: r.id,
          item_name: r.item_name ?? "",
          start_date: r.start_date,
          expires_at: r.expires_at,
          paid_at: paidAt.get(r.id) ?? r.created_at,
        }))
    );
  }
  return out;
}
