import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/member-app/memberships?centerId=
 * 내 회원권(이용권) + 락커/대여(운동복 등) 구성.
 * 회원권-락커-대여는 FK 로 직접 묶여있지 않고 member_id + 상태로 조회한다.
 */
export async function GET(request: Request) {
  const centerId = Number(new URL(request.url).searchParams.get("centerId"));
  const ctx = await requireMemberForCenter(request, centerId);
  if (isMemberError(ctx)) return ctx;

  const [{ data: memberships, error }, { data: lockers }, { data: rentals }] = await Promise.all([
    supabase
      .from("crm_memberships")
      .select("id, plan_name, duration_days, start_date, expires_at, purchased_at, price_won, status, attendance_mileage_earn, mileage_earned, mileage_used")
      .eq("center_id", ctx.centerId)
      .eq("member_id", ctx.memberId)
      .in("status", ["valid", "expired"])
      .order("status", { ascending: true })
      .order("expires_at", { ascending: true }),
    supabase
      .from("crm_lockers")
      .select("id, zone_id, number, state, start_date, expires_at")
      .eq("center_id", ctx.centerId)
      .eq("assigned_member_id", ctx.memberId)
      .neq("state", "broken"),
    supabase
      .from("crm_rentals")
      .select("id, item_name, start_date, expires_at, price_won, created_at, status")
      .eq("center_id", ctx.centerId)
      .eq("member_id", ctx.memberId)
      .eq("status", "valid"),
  ]);
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  const todayYmd = new Date(new Date().getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const dday = (ymd: string | null) =>
    ymd
      ? Math.ceil(
          (new Date(`${ymd}T00:00:00+09:00`).getTime() -
            new Date(`${todayYmd}T00:00:00+09:00`).getTime()) /
            (24 * 3600 * 1000)
        )
      : null;

  // 락커 구역(존) 이름 조회 → "남자탈의실 - 39번" 라벨용
  const zoneIds = Array.from(new Set((lockers ?? []).map((l) => l.zone_id).filter(Boolean)));
  const zoneMap = new Map<number, string>();
  if (zoneIds.length) {
    const { data: zones } = await supabase
      .from("crm_locker_zones")
      .select("id, name")
      .in("id", zoneIds as number[]);
    for (const z of zones ?? []) zoneMap.set(z.id, z.name);
  }

  // 락커 상품은 crm_rentals(과금 항목)과 crm_lockers(실물 배정)에 쌍으로 생성된다.
  // → 회원 화면에 락커가 2번 뜨는 것을 막기 위해, 실물 락커에 락커성 rental을 1:1 매칭해
  //   상품명을 락커 카드 제목으로 흡수하고, 매칭된 rental 은 목록에서 제거한다.
  //   (실물 락커가 없으면 rental 을 그대로 노출 = 폴백)
  const isLockerRental = (name: string | null) =>
    !!name && name.includes("락커") && !name.includes("운동복");
  const rentalList = [...(rentals ?? [])];
  const usedRentalIds = new Set<number>();
  const lockerNameById = new Map<number, string>();
  for (const l of lockers ?? []) {
    // 만료일이 같은 락커성 rental 우선, 없으면 아무 락커성 rental
    const idx =
      rentalList.findIndex(
        (r) => !usedRentalIds.has(r.id) && isLockerRental(r.item_name) && r.expires_at === l.expires_at
      );
    const useIdx =
      idx >= 0
        ? idx
        : rentalList.findIndex((r) => !usedRentalIds.has(r.id) && isLockerRental(r.item_name));
    if (useIdx >= 0) {
      usedRentalIds.add(rentalList[useIdx].id);
      lockerNameById.set(l.id, rentalList[useIdx].item_name);
    }
  }

  return NextResponse.json({
    memberships: (memberships ?? []).map((m) => ({
      id: m.id,
      planName: m.plan_name,
      durationDays: m.duration_days,
      startDate: m.start_date,
      expiresAt: m.expires_at,
      purchasedAt: m.purchased_at ?? m.start_date,
      priceWon: m.price_won ?? null,
      dday: dday(m.expires_at),
      status: m.status,
      attendanceMileageEarn: m.attendance_mileage_earn ?? 0,
    })),
    lockers: (lockers ?? []).map((l) => {
      const assigned = l.state === "assigned" && l.number != null;
      const zoneName = l.zone_id ? zoneMap.get(l.zone_id) : null;
      const assignmentLabel = assigned && zoneName ? `${zoneName} - ${l.number}번` : "미배정";
      return {
        id: l.id,
        label: lockerNameById.get(l.id) ?? "락커",
        assignmentLabel,
        assigned,
        startDate: l.start_date,
        expiresAt: l.expires_at,
        purchasedAt: l.start_date,
        priceWon: null,
        dday: dday(l.expires_at),
      };
    }),
    rentals: rentalList
      .filter((r) => !usedRentalIds.has(r.id))
      .map((r) => ({
        id: r.id,
        itemName: r.item_name,
        startDate: r.start_date,
        expiresAt: r.expires_at,
        purchasedAt: (r.created_at ?? "").slice(0, 10) || r.start_date,
        priceWon: r.price_won ?? null,
        dday: dday(r.expires_at),
      })),
  });
}
