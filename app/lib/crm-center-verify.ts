import { supabase } from "./supabase";
import { residentHash, digitsOnly } from "./crm-identity";

export interface CenterIdentityInput {
  center_name?: string;
  owner_name?: string;
  owner_phone?: string;
  business_no?: string;
  resident_no?: string;
}

/**
 * 센터 탈퇴·양도 본인 확인: 센터명·대표자명·대표자 휴대폰·사업자번호·대표자 주민번호(해시)를
 * 모두 대조. 불일치 시 사용자 메시지, 전부 일치 시 null.
 *
 * ownerUid = 확인을 수행하는 대표자(현재 로그인)의 firebase_uid.
 */
export async function verifyCenterIdentity(
  centerId: number,
  ownerUid: string,
  input: CenterIdentityInput
): Promise<string | null> {
  const { data: center } = await supabase
    .from("crm_centers")
    .select("name, business_no")
    .eq("id", centerId)
    .maybeSingle();
  if (!center) return "센터를 찾을 수 없습니다";

  const { data: owner } = await supabase
    .from("crm_center_members")
    .select("display_name, phone, resident_hash")
    .eq("center_id", centerId)
    .eq("firebase_uid", ownerUid)
    .maybeSingle();
  const o = owner as (typeof owner & { resident_hash?: string | null }) | null;

  if ((input.center_name ?? "").trim() !== (center.name ?? "").trim())
    return "센터 이름이 일치하지 않습니다";
  if ((input.owner_name ?? "").trim() !== (o?.display_name ?? "").trim())
    return "대표자 이름이 일치하지 않습니다";
  if (digitsOnly(input.owner_phone) !== digitsOnly(o?.phone))
    return "대표자 휴대폰번호가 일치하지 않습니다";
  if (center.business_no && digitsOnly(input.business_no) !== digitsOnly(center.business_no))
    return "사업자 등록번호가 일치하지 않습니다";
  if (!o?.resident_hash)
    return "대표자 주민번호가 등록돼 있지 않습니다. 직원 관리 > 대표자 상세에서 먼저 등록해 주세요";
  if (residentHash(input.resident_no) !== o.resident_hash)
    return "대표자 주민번호가 일치하지 않습니다";
  return null;
}
