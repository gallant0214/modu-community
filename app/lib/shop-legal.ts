import "server-only";
import { supabase } from "@/app/lib/supabase";

/**
 * 판매 페이지에 노출할 법정 고지(이용약관·개인정보처리방침·환불규정)를
 * **센터 전자계약서에서** 가져온다.
 *
 * 🚨 계약서와 홈페이지 문구가 다르면 분쟁이 난다. 출처를 계약서 하나로 묶는다.
 *    센터가 고른 계약서(crm_centers.policy_contract_template_id)의 조항을
 *    제목으로 골라 쓴다.
 */

export type LegalKind = "refund" | "terms" | "privacy";

/** 어떤 조항을 어느 페이지에 쓸지 — 제목으로 고른다 */
const TITLE_MATCH: Record<LegalKind, RegExp> = {
  refund: /환불|해지/,
  // 이용약관: 환불·개인정보를 뺀 나머지 운영 약관(이용/양도/특약 등)
  terms: /약관|특약|양도|규칙|이용/,
  privacy: /개인정보/,
};
const TITLE_EXCLUDE: Record<LegalKind, RegExp | null> = {
  refund: null,
  terms: /환불|해지|개인정보|광고성/,
  privacy: null,
};

export interface LegalSection {
  title: string;
  body: string;
}

/** 센터가 지정한 계약서에서 해당 종류의 조항들을 뽑는다 */
export async function loadContractSections(
  centerId: number,
  kind: LegalKind
): Promise<LegalSection[]> {
  const { data: c } = await supabase
    .from("crm_centers")
    .select("policy_contract_template_id")
    .eq("id", centerId)
    .maybeSingle();
  const templateId = (c as { policy_contract_template_id: number | null } | null)
    ?.policy_contract_template_id;
  if (!templateId) return [];

  const { data } = await supabase
    .from("crm_contract_templates")
    .select("sections, status")
    .eq("id", templateId)
    .maybeSingle();
  const t = data as { sections: unknown; status: string } | null;
  if (!t || t.status !== "active") return [];

  const sections = Array.isArray(t.sections)
    ? (t.sections as { title?: string; body?: string }[])
    : [];
  const include = TITLE_MATCH[kind];
  const exclude = TITLE_EXCLUDE[kind];

  return sections
    .filter((s) => {
      const title = s.title ?? "";
      if (!include.test(title)) return false;
      if (exclude && exclude.test(title)) return false;
      return !!(s.body ?? "").trim();
    })
    .map((s) => ({
      title: (s.title ?? "").trim(),
      body: (s.body ?? "").trim().replace(/\n{3,}/g, "\n\n"),
    }));
}

/** 판매 페이지 법정 고지에 쓰는 센터 정보 */
export interface LegalCenter {
  name: string;
  legalName: string;
  ownerName: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
}

export async function loadLegalCenter(centerId: number): Promise<LegalCenter | null> {
  const { data } = await supabase
    .from("crm_centers")
    .select("name, legal_name, owner_name, address, address_detail, phone, support_email")
    .eq("id", centerId)
    .maybeSingle();
  const c = data as {
    name: string;
    legal_name: string | null;
    owner_name: string | null;
    address: string | null;
    address_detail: string | null;
    phone: string | null;
    support_email: string | null;
  } | null;
  if (!c) return null;
  return {
    name: c.name,
    legalName: c.legal_name?.trim() || c.name,
    ownerName: c.owner_name,
    address: [c.address, c.address_detail].filter(Boolean).join(" ") || null,
    phone: c.phone,
    email: c.support_email,
  };
}
