import { supabase } from "@/app/lib/supabase";

/**
 * 판매자 정보 표기 — 전자상거래법 의무이자 PG 심사에서 실제로 반려 사유가 되는 항목.
 * 상호·대표자·사업자번호·통신판매업신고번호·주소·연락처·이메일 + 환불 규정.
 */
export interface Seller {
  /** 화면 표기용 센터 이름 (지점명 포함 가능) */
  name: string;
  /** 🚨 사업자등록증상 상호. 카드사 심사는 등록증과 '완전히 일치'할 것을 요구한다 */
  legalName: string;
  ownerName: string | null;
  businessNo: string | null;
  mailOrderNo: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  refundPolicy: string | null;
}

/**
 * 판매 페이지에 노출할 환불 규정을 센터 전자계약서에서 가져온다.
 *
 * 🚨 계약서와 홈페이지 문구가 다르면 분쟁이 난다. 출처를 계약서 하나로 묶는다.
 *    센터가 고른 계약서(crm_centers.policy_contract_template_id)에서
 *    제목에 '환불' 또는 '해지' 가 들어간 조항만 뽑아 쓴다.
 */
async function loadRefundPolicyFromContract(templateId: number | null): Promise<string | null> {
  if (!templateId) return null;
  const { data } = await supabase
    .from("crm_contract_templates")
    .select("sections, status")
    .eq("id", templateId)
    .maybeSingle();
  const t = data as { sections: unknown; status: string } | null;
  if (!t || t.status !== "active") return null;

  const sections = Array.isArray(t.sections)
    ? (t.sections as { title?: string; body?: string }[])
    : [];
  const picked = sections.filter((sec) => /환불|해지/.test(sec.title ?? ""));
  if (picked.length === 0) return null;

  return picked
    .map((sec) => (sec.body ?? "").trim())
    .filter(Boolean)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function loadSellerInfo(centerId: number): Promise<Seller | null> {
  const { data } = await supabase
    .from("crm_centers")
    .select(
      "name, legal_name, owner_name, business_no, mail_order_no, address, address_detail, phone, support_email, refund_policy, policy_contract_template_id"
    )
    .eq("id", centerId)
    .maybeSingle();
  const c = data as {
    name: string;
    legal_name: string | null;
    owner_name: string | null;
    business_no: string | null;
    mail_order_no: string | null;
    address: string | null;
    address_detail: string | null;
    phone: string | null;
    support_email: string | null;
    refund_policy: string | null;
    policy_contract_template_id: number | null;
  } | null;
  if (!c) return null;

  // 계약서 → 센터가 직접 쓴 문구 → 기본 문구 순으로 쓴다
  const fromContract = await loadRefundPolicyFromContract(c.policy_contract_template_id);
  return {
    name: c.name,
    // 등록증 상호가 따로 없으면 센터명을 쓴다(기존 동작 유지)
    legalName: c.legal_name?.trim() || c.name,
    ownerName: c.owner_name,
    businessNo: c.business_no,
    mailOrderNo: c.mail_order_no,
    address: [c.address, c.address_detail].filter(Boolean).join(" ") || null,
    phone: c.phone,
    email: c.support_email,
    refundPolicy: fromContract || c.refund_policy,
  };
}

/** 체육시설 소비자분쟁해결기준에 맞춘 기본 문구 — 센터가 따로 등록하지 않았을 때 */
export const DEFAULT_REFUND_POLICY = `· 이용 시작 전 취소: 전액 환불(결제수단 수수료 제외)
· 이용 시작 후 중도 해지: 이용일수에 해당하는 금액과 위약금(총액의 10%)을 공제한 잔액 환불
· 쿠폰·마일리지로 할인받은 금액은 환불 대상에서 제외되며, 사용한 마일리지는 환불 시 돌려드립니다
· 환불 요청은 센터 연락처 또는 이메일로 접수해주세요`;

export default function SellerInfo({
  seller,
  /** 환불 규정을 이미 본문에 보여준 페이지에서는 중복 표시하지 않는다 */
  hideRefundPolicy,
}: {
  seller: Seller | null;
  hideRefundPolicy?: boolean;
}) {
  if (!seller) return null;
  const rows: [string, string | null][] = [
    ["상호", seller.legalName],
    ["대표자", seller.ownerName],
    ["사업자등록번호", seller.businessNo],
    ["통신판매업신고번호", seller.mailOrderNo],
    ["사업장 주소", seller.address],
    ["연락처", seller.phone],
    ["이메일", seller.email],
  ];
  return (
    <footer className="mt-10 border-t border-gray-200 pt-6 text-xs leading-relaxed text-gray-500">
      {!hideRefundPolicy && (
        <>
          <p className="mb-2 font-semibold text-gray-700">환불·해지 규정</p>
          <p className="whitespace-pre-line">{seller.refundPolicy || DEFAULT_REFUND_POLICY}</p>
        </>
      )}

      <p className={`mb-2 font-semibold text-gray-700 ${hideRefundPolicy ? "" : "mt-5"}`}>
        판매자 정보
      </p>
      <dl className="space-y-0.5">
        {rows
          .filter(([, v]) => !!v)
          .map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="shrink-0 text-gray-400">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
    </footer>
  );
}
