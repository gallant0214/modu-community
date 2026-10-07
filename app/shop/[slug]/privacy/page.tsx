import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabase } from "@/app/lib/supabase";
import { isValidShopSlug } from "@/app/lib/shop-slug";
import { loadContractSections, loadLegalCenter } from "@/app/lib/shop-legal";
import { loadSellerInfo } from "@/app/pay/SellerInfo";
import { LegalShell, LegalSectionBlock } from "../_legal-shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "개인정보처리방침",
  robots: { index: false, follow: false },
};

/**
 * /shop/[slug]/privacy — 개인정보처리방침.
 *
 * PG 심사가 '개인정보처리방침 링크 또는 필수 고지 항목' 유무를 검사한다.
 * 계약서의 개인정보 수집·이용 동의 내용만으로는 법정 고지 항목이 모자라므로
 * (제3자 제공·처리위탁·정보주체 권리·파기·안전성 조치·보호책임자)
 * 그 항목들을 센터 정보로 채워 함께 싣는다.
 */
export default async function ShopPrivacyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isValidShopSlug(slug)) notFound();

  const { data } = await supabase
    .from("crm_centers")
    .select("id, name, status")
    .eq("shop_slug", slug)
    .maybeSingle();
  const center = data as { id: number; name: string; status: string } | null;
  if (!center || center.status !== "active") notFound();

  const [consentSections, info, seller] = await Promise.all([
    loadContractSections(center.id, "privacy"),
    loadLegalCenter(center.id),
    loadSellerInfo(center.id),
  ]);

  const biz = info?.legalName ?? center.name;
  const owner = info?.ownerName ?? "대표자";
  const phone = info?.phone ?? "-";
  const email = info?.email ?? "-";

  return (
    <LegalShell
      slug={slug}
      centerName={center.name}
      heading="개인정보처리방침"
      seller={seller}
      intro={
        <p>
          {biz}(이하 &lsquo;센터&rsquo;)는 「개인정보 보호법」에 따라 회원의 개인정보를
          보호하고 이와 관련한 고충을 신속히 처리하기 위해 다음과 같이 개인정보처리방침을
          두고 있습니다.
        </p>
      }
    >
      {/* 계약서에 적힌 수집·이용 동의 내용 그대로 */}
      {consentSections.map((s) => (
        <LegalSectionBlock key={s.title} title={s.title} body={s.body} />
      ))}

      <LegalSectionBlock
        title="개인정보의 제3자 제공"
        body={
          "센터는 회원의 개인정보를 원칙적으로 제3자에게 제공하지 않습니다.\n" +
          "다만 다음의 경우는 예외로 합니다.\n" +
          "· 회원이 사전에 동의한 경우\n" +
          "· 법령에 따라 수사기관의 요구가 있는 경우"
        }
      />

      <LegalSectionBlock
        title="개인정보 처리의 위탁"
        body={
          "센터는 서비스 제공을 위해 아래와 같이 개인정보 처리업무를 위탁하고 있습니다.\n\n" +
          "· 결제 처리 : 전자지급결제대행(PG)사 — 카드 결제 승인·취소 및 정산\n" +
          "· 알림 발송 : 문자·앱 푸시 발송 대행사 — 이용 안내 및 공지 발송\n" +
          "· 시스템 운영 : 회원관리 시스템 운영사 — 회원·이용권 정보 보관\n\n" +
          "센터는 위탁계약 시 개인정보가 안전하게 관리되도록 필요한 사항을 규정하고 있으며,\n" +
          "위탁업무의 내용이 변경될 경우 본 방침을 통해 공개합니다.\n" +
          "※ 센터는 카드번호 등 결제수단 정보를 직접 보관하지 않습니다."
        }
      />

      <LegalSectionBlock
        title="정보주체의 권리와 행사 방법"
        body={
          "회원은 언제든지 다음의 권리를 행사할 수 있습니다.\n" +
          "· 개인정보 열람 요구\n" +
          "· 오류가 있을 경우 정정 요구\n" +
          "· 삭제 요구\n" +
          "· 처리 정지 요구\n\n" +
          `권리 행사는 센터 프런트 방문, 전화(${phone}) 또는 이메일(${email})로 하실 수 있으며,\n` +
          "센터는 지체 없이 조치하겠습니다."
        }
      />

      <LegalSectionBlock
        title="개인정보의 파기"
        body={
          "센터는 보유기간이 지나거나 처리 목적이 달성된 개인정보를 지체 없이 파기합니다.\n" +
          "· 전자적 파일 : 복구할 수 없는 방법으로 영구 삭제\n" +
          "· 종이 문서 : 분쇄하거나 소각\n\n" +
          "다만 관계 법령에 따라 보존이 필요한 정보는 해당 기간 동안 보관합니다.\n" +
          "· 계약 및 대금결제에 관한 기록 : 5년 (전자상거래법)\n" +
          "· 소비자 불만 또는 분쟁처리에 관한 기록 : 3년 (전자상거래법)"
        }
      />

      <LegalSectionBlock
        title="개인정보의 안전성 확보 조치"
        body={
          "· 개인정보 취급 직원의 최소화 및 교육\n" +
          "· 개인정보처리시스템 접근 권한의 제한\n" +
          "· 주요 정보의 암호화 저장 및 전송 구간 암호화(HTTPS)\n" +
          "· 접속 기록의 보관"
        }
      />

      <LegalSectionBlock
        title="개인정보 보호책임자"
        body={
          `· 성명 : ${owner}\n` +
          `· 연락처 : ${phone}\n` +
          `· 이메일 : ${email}\n\n` +
          "회원은 센터의 서비스를 이용하며 발생한 모든 개인정보 보호 관련 문의를\n" +
          "개인정보 보호책임자에게 하실 수 있습니다."
        }
      />

      <LegalSectionBlock
        title="개인정보처리방침의 변경"
        body={
          "본 방침의 내용 추가·삭제 및 수정이 있을 경우 변경 사항의 시행 7일 전부터\n" +
          "홈페이지를 통해 공지합니다."
        }
      />
    </LegalShell>
  );
}
