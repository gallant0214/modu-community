import { supabase } from "./supabase";
import { digitsOnly } from "./crm-identity";

export interface CenterIdentityInput {
  center_name?: string;
  owner_name?: string;
  owner_phone?: string;
  business_no?: string;
  /** 대표자 생년월일 6자리(YYMMDD). 개인정보 최소화를 위해 주민번호 대신 생년월일만 대조. */
  resident_no?: string;
}

/** 생년월일 → YYMMDD 6자리 (YYYY-MM-DD 도 허용) */
function toYYMMDD(v: string | null | undefined): string {
  const d = digitsOnly(v);
  if (d.length >= 8) return d.slice(2, 8); // YYYYMMDD → YYMMDD
  return d.length === 6 ? d : "";
}

/**
 * 센터 탈퇴·양도 본인 확인: 센터명·대표자명·대표자 휴대폰·사업자번호·대표자 생년월일(6자리)을
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
    .select("display_name, phone, birth")
    .eq("center_id", centerId)
    .eq("firebase_uid", ownerUid)
    .maybeSingle();
  const o = owner as (typeof owner & { birth?: string | null }) | null;

  if ((input.center_name ?? "").trim() !== (center.name ?? "").trim())
    return "센터 이름이 일치하지 않습니다";
  if ((input.owner_name ?? "").trim() !== (o?.display_name ?? "").trim())
    return "대표자 이름이 일치하지 않습니다";
  if (digitsOnly(input.owner_phone) !== digitsOnly(o?.phone))
    return "대표자 휴대폰번호가 일치하지 않습니다";
  if (center.business_no && digitsOnly(input.business_no) !== digitsOnly(center.business_no))
    return "사업자 등록번호가 일치하지 않습니다";
  const ownerYYMMDD = toYYMMDD(o?.birth);
  if (!ownerYYMMDD)
    return "대표자 생년월일이 등록돼 있지 않습니다. 직원 관리 > 대표자 상세에서 먼저 등록해 주세요";
  if (toYYMMDD(input.resident_no) !== ownerYYMMDD)
    return "대표자 생년월일이 일치하지 않습니다";
  return null;
}
