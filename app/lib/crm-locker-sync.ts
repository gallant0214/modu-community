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

/**
 * 대여권 '종류' 키 — 만료 판정 시 같은 종류를 이어서 결제했는지 묶는 기준.
 *
 * 이름 문자열 정규화만으로는 부족하다: '스포츠바우처 1개월(운동복)' 처럼 종류가 괄호 안에
 * 들어간 상품명이 있어, 괄호를 지우면 '운동복 1개월' 과 다른 종류로 오판된다.
 * 그래서 카테고리를 먼저 판정한다.
 *   1) 이름 어디든 '운동복' → apparel   ('운동복 3개월(상가)' 처럼 상가가 괄호에 있어도 운동복)
 *   2) 락커 대여권(이름·메모 기준)       → locker
 *   3) 그 외 → 괄호 설명·기간 표기·공백을 뺀 이름
 */
export function rentalKindKey(itemName: string | null, memo: string | null): string {
  const name = (itemName ?? "").trim();
  if (name.includes("운동복")) return "apparel";
  if (name.includes("락커") || looksLikeLockerRental(name, memo)) return "locker";
  const key = name
    .replace(/\([^)]*\)/g, "")
    .replace(/\d+\s*(개월|달|년|주|일)/g, "")
    .replace(/\s+/g, "");
  return key || name;
}
