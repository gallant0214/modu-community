import { supabase } from "@/app/lib/supabase";
import { looksLikeLockerRental } from "@/app/lib/crm-locker-sync";

/**
 * 락커 배정 한도 = **유효한 락커 이용권(대여권) 수**.
 *
 * 🚨 규칙 (2026-10-09 사용자 확정):
 *   - 락커 이용권 1개 = 락커 배정 1개. 이용권 수를 넘겨 배정할 수 없다.
 *   - 이용권이 2개면 2개까지 배정 가능.
 *   - 이용권이 없는 회원은 배정 불가 + 배정용 회원검색에도 나오지 않는다.
 *   - '이동'(move)은 기존 배정을 옮기는 것이라 수가 늘지 않으므로 한도 검사 대상이 아니다.
 *   - 같은 회원·같은 락커 연장(재배정)도 수가 늘지 않으므로 검사하지 않는다.
 *
 * 락커 이용권 판별은 [[crm-locker-sync]] 의 looksLikeLockerRental(이름·메모 기준)을 그대로 쓴다.
 */
export interface LockerQuota {
  /** 유효한 락커 이용권 수 */
  rentals: number;
  /** 현재 배정된 락커 수 */
  assigned: number;
  /** 추가 배정 가능 여부 */
  canAssign: boolean;
}

function todayKst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 회원 한 명의 락커 배정 한도 */
export async function lockerQuotaFor(centerId: number, memberId: number): Promise<LockerQuota> {
  const today = todayKst();
  const [{ data: rentals }, { data: lockers }] = await Promise.all([
    supabase
      .from("crm_rentals")
      .select("item_name, memo")
      .eq("center_id", centerId)
      .eq("member_id", memberId)
      .eq("status", "valid")
      .gte("expires_at", today),
    supabase
      .from("crm_lockers")
      .select("id")
      .eq("center_id", centerId)
      .eq("assigned_member_id", memberId)
      .eq("state", "assigned"),
  ]);

  const rentalCount = ((rentals ?? []) as { item_name: string | null; memo: string | null }[]).filter(
    (r) => looksLikeLockerRental(r.item_name, r.memo)
  ).length;
  const assignedCount = ((lockers ?? []) as unknown[]).length;

  return { rentals: rentalCount, assigned: assignedCount, canAssign: rentalCount > assignedCount };
}

/**
 * 여러 회원의 한도를 한 번에 — 배정용 회원검색 목록에서 쓴다.
 * 반환: member_id → LockerQuota (락커 이용권이 하나도 없는 회원은 키 자체가 없음)
 */
export async function lockerQuotaMap(centerId: number): Promise<Map<number, LockerQuota>> {
  const today = todayKst();
  const [{ data: rentals }, { data: lockers }] = await Promise.all([
    supabase
      .from("crm_rentals")
      .select("member_id, item_name, memo")
      .eq("center_id", centerId)
      .eq("status", "valid")
      .gte("expires_at", today),
    supabase
      .from("crm_lockers")
      .select("assigned_member_id")
      .eq("center_id", centerId)
      .eq("state", "assigned")
      .not("assigned_member_id", "is", null),
  ]);

  const rentalCount = new Map<number, number>();
  for (const r of (rentals ?? []) as {
    member_id: number | null;
    item_name: string | null;
    memo: string | null;
  }[]) {
    if (!r.member_id) continue;
    if (!looksLikeLockerRental(r.item_name, r.memo)) continue;
    rentalCount.set(r.member_id, (rentalCount.get(r.member_id) ?? 0) + 1);
  }

  const assignedCount = new Map<number, number>();
  for (const l of (lockers ?? []) as { assigned_member_id: number | null }[]) {
    if (!l.assigned_member_id) continue;
    assignedCount.set(l.assigned_member_id, (assignedCount.get(l.assigned_member_id) ?? 0) + 1);
  }

  const out = new Map<number, LockerQuota>();
  for (const [memberId, rc] of rentalCount) {
    const ac = assignedCount.get(memberId) ?? 0;
    out.set(memberId, { rentals: rc, assigned: ac, canAssign: rc > ac });
  }
  return out;
}
