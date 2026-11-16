import { supabase } from "@/app/lib/supabase";
import { digitsOnly } from "@/app/lib/crm-identity";

/**
 * 같은 센터에서 이 전화번호를 쓰는 **활성 회원** 목록.
 *
 * 🚨 규칙 (2026-11-16 사용자 확정): 같은 센터에 같은 번호로 회원이 두 명 생기면 안 된다.
 *   이름이 달라도 번호만 같으면 막는다. 회원 등록(직원)·QR 웹가입·회원앱 가입·연락처 수정(직원·회원앱)
 *   모두 이 함수로 검사한다.
 *   단, 직원이 미리 등록해 둔 회원에 '같은 이름+번호'로 가입하면 새로 만들지 않고 그 회원에 연결하는
 *   기존 흐름은 그대로 — 그 경우 호출하는 쪽이 연결 대상을 excludeId 로 넘기거나 먼저 처리한다.
 *
 * 번호는 숫자만 비교한다(010-1234-5678 = 01012345678). 8자리 미만이면 비교하지 않는다.
 * excludeId = 수정 중인 본인(또는 연결할 대상) 회원.
 */
export async function findMembersWithPhone(
  centerId: number,
  phone: string | null | undefined,
  excludeId?: number | null
): Promise<{ id: number; name: string; member_type: string; linked_firebase_uid: string | null }[]> {
  const d = digitsOnly(phone);
  if (d.length < 8) return [];
  const { data } = await supabase
    .from("crm_members")
    .select("id, name, phone, member_type, linked_firebase_uid")
    .eq("center_id", centerId)
    .eq("status", "active")
    // 뒷 4자리는 하이픈 형식이어도 붙어 있으므로 후보를 좁힌 뒤 숫자로 정확히 비교
    .ilike("phone", `%${d.slice(-4)}%`);
  return ((data ?? []) as {
    id: number;
    name: string;
    phone: string | null;
    member_type: string;
    linked_firebase_uid: string | null;
  }[])
    .filter((m) => m.id !== excludeId && digitsOnly(m.phone) === d)
    .map((m) => ({ id: m.id, name: m.name, member_type: m.member_type, linked_firebase_uid: m.linked_firebase_uid }));
}

/** 회원(셀프가입·앱) 쪽 안내 — 다른 회원 이름은 보여주지 않는다 */
export const PHONE_TAKEN_PUBLIC_MESSAGE =
  "이미 이 전화번호로 등록된 회원이 있어요. 센터에 문의해 주세요.";
