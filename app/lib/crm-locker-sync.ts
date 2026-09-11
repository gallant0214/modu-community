import { supabase } from "@/app/lib/supabase";

/**
 * 락커 대여권(crm_rentals) ↔ 물리 락커(crm_lockers) 시작/만료일 동기화.
 *
 * 대여권만 바뀌고 락커 배정 정보가 어긋나는 사고를 막기 위해, 대여권 날짜를 바꾸는 곳은
 * (수정·홀딩·홀딩해제 등) 모두 이 헬퍼를 거쳐야 한다.
 *
 * 대상 판별: item_name 이 '락커/상가' 로 시작하거나 memo 에 락커 표기(‘○○ 12번’ 등)가 있으면 락커 대여권.
 * 어느 락커인지: memo 라벨 매칭 우선, 매칭이 없고 배정 락커가 1개뿐이면 그 락커로 폴백.
 */
export function looksLikeLockerRental(itemName: string | null, memo: string | null): boolean {
  const name = (itemName ?? "").trim();
  const mm = memo ?? "";
  return /^(락커|상가)/.test(name) || mm.includes("락커") || /\d+번/.test(mm) || mm.includes("미배정");
}

export async function syncLockerDatesFromRental(
  centerId: number,
  rental: { member_id: number | null; item_name: string | null; memo: string | null },
  patch: { start_date?: string; expires_at?: string }
): Promise<number | null> {
  if (patch.start_date === undefined && patch.expires_at === undefined) return null;
  if (!rental.member_id || !looksLikeLockerRental(rental.item_name, rental.memo)) return null;

  const { data: assigned } = await supabase
    .from("crm_lockers")
    .select("id, number, crm_locker_zones!inner(name)")
    .eq("assigned_member_id", rental.member_id)
    .eq("center_id", centerId)
    .eq("state", "assigned");
  const list = (assigned ?? []) as unknown as {
    id: number;
    number: number;
    crm_locker_zones: { name: string };
  }[];
  const memo = rental.memo ?? "";
  const matched = list.filter((l) => memo.includes(`${l.crm_locker_zones.name} ${l.number}번`));
  const target =
    matched.length === 1 ? matched[0] : matched.length === 0 && list.length === 1 ? list[0] : null;
  if (!target) return null;

  const lPatch: Record<string, unknown> = {};
  if (patch.start_date !== undefined) lPatch.start_date = patch.start_date;
  if (patch.expires_at !== undefined) lPatch.expires_at = patch.expires_at;
  await supabase
    .from("crm_lockers")
    .update(lPatch as never)
    .eq("id", target.id)
    .eq("center_id", centerId);
  return target.id;
}
