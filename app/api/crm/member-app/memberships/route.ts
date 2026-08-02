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
      .select("id, number, state, start_date, expires_at")
      .eq("center_id", ctx.centerId)
      .eq("assigned_member_id", ctx.memberId)
      .eq("state", "assigned"),
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
    lockers: (lockers ?? []).map((l) => ({
      id: l.id,
      label: `${l.number}번 락커`,
      startDate: l.start_date,
      expiresAt: l.expires_at,
      purchasedAt: l.start_date,
      priceWon: null,
      dday: dday(l.expires_at),
    })),
    rentals: (rentals ?? []).map((r) => ({
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
