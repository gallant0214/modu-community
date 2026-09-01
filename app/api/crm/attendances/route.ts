import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/attendances?date=YYYY-MM-DD
 * 그 날의 출석 기록 (KST). 회원별로 얼굴·상태(활성/만료)·유효 회원권·만료 이용권 포함.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);

  const startUtc = new Date(`${date}T00:00:00+09:00`);
  const endUtc = new Date(startUtc.getTime() + 24 * 3600 * 1000);
  const todayKst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("crm_attendances")
    .select("id, member_id, checked_in_at, source, note")
    .eq("center_id", ctx.centerId)
    .gte("checked_in_at", startUtc.toISOString())
    .lt("checked_in_at", endUtc.toISOString())
    .order("checked_in_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  const memberIds = Array.from(new Set((data ?? []).map((a) => a.member_id)));

  // 회원 기본 + 얼굴 / 유효·만료 이용권 병렬 조회
  const [membersRes, mshipRes, passRes, rentalRes, lockerRes] = await Promise.all([
    memberIds.length
      ? supabase.from("crm_members").select("id, name, phone, face_image_thumb, linked_firebase_uid").in("id", memberIds)
      : Promise.resolve({ data: [] as never[] }),
    memberIds.length
      ? supabase
          .from("crm_memberships")
          .select("member_id, plan_name, expires_at, status")
          .eq("center_id", ctx.centerId)
          .eq("status", "valid")
          .in("member_id", memberIds)
      : Promise.resolve({ data: [] as never[] }),
    memberIds.length
      ? supabase
          .from("crm_passes")
          .select("member_id, expires_at, status")
          .eq("center_id", ctx.centerId)
          .eq("status", "valid")
          .in("member_id", memberIds)
      : Promise.resolve({ data: [] as never[] }),
    memberIds.length
      ? supabase
          .from("crm_rentals")
          .select("member_id, item_name, expires_at, status")
          .eq("center_id", ctx.centerId)
          .eq("status", "valid")
          .in("member_id", memberIds)
      : Promise.resolve({ data: [] as never[] }),
    memberIds.length
      ? supabase
          .from("crm_lockers")
          .select("assigned_member_id, number, expires_at")
          .eq("center_id", ctx.centerId)
          .in("assigned_member_id", memberIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  type Member = { id: number; name: string; phone: string | null; face_image_thumb: string | null; linked_firebase_uid: string | null };
  const memberMap = new Map<number, Member>(
    ((membersRes.data ?? []) as unknown as Member[]).map((m) => [m.id, m])
  );

  const daysLeft = (ymd: string): number => {
    const a = new Date(`${todayKst}T00:00:00Z`).getTime();
    const b = new Date(`${ymd}T00:00:00Z`).getTime();
    return Math.round((b - a) / (24 * 3600 * 1000));
  };

  type Mship = { member_id: number; plan_name: string; expires_at: string };
  type Pass = { member_id: number; expires_at: string };
  type Rental = { member_id: number; item_name: string; expires_at: string };
  type Locker = { assigned_member_id: number; number: string | number; expires_at: string | null };

  const primaryMembership = new Map<number, { plan_name: string; expires_at: string; days_left: number }>();
  const activeSet = new Set<number>();
  const expiredItems = new Map<number, { type: "rental" | "locker"; name: string; expires_at: string }[]>();

  for (const m of (mshipRes.data ?? []) as unknown as Mship[]) {
    if (m.expires_at >= todayKst) {
      activeSet.add(m.member_id);
      const cur = primaryMembership.get(m.member_id);
      if (!cur || m.expires_at > cur.expires_at) {
        primaryMembership.set(m.member_id, {
          plan_name: m.plan_name,
          expires_at: m.expires_at,
          days_left: daysLeft(m.expires_at),
        });
      }
    }
  }
  for (const p of (passRes.data ?? []) as unknown as Pass[]) {
    if (p.expires_at >= todayKst) activeSet.add(p.member_id);
  }
  const pushExpired = (
    memberId: number,
    item: { type: "rental" | "locker"; name: string; expires_at: string }
  ) => {
    const arr = expiredItems.get(memberId) ?? [];
    arr.push(item);
    expiredItems.set(memberId, arr);
  };
  for (const r of (rentalRes.data ?? []) as unknown as Rental[]) {
    if (r.expires_at < todayKst) {
      pushExpired(r.member_id, { type: "rental", name: r.item_name, expires_at: r.expires_at });
    }
  }
  for (const l of (lockerRes.data ?? []) as unknown as Locker[]) {
    if (l.expires_at && l.expires_at < todayKst && l.assigned_member_id) {
      pushExpired(l.assigned_member_id, {
        type: "locker",
        name: `${l.number}번 락커`,
        expires_at: l.expires_at,
      });
    }
  }

  return NextResponse.json({
    attendances: (data ?? []).map((a) => {
      const m = memberMap.get(a.member_id) ?? null;
      return {
        ...a,
        member: m
          ? {
              id: m.id,
              name: m.name,
              phone: m.phone,
              face_thumb: m.face_image_thumb,
              app_linked: !!m.linked_firebase_uid,
              status: activeSet.has(a.member_id) ? "active" : "expired",
              membership: primaryMembership.get(a.member_id) ?? null,
              expired_items: expiredItems.get(a.member_id) ?? [],
            }
          : null,
      };
    }),
  });
}
