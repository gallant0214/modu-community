import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabase } from "@/app/lib/supabase";
import { isValidShopSlug } from "@/app/lib/shop-slug";
import { loadContractSections } from "@/app/lib/shop-legal";
import { loadSellerInfo } from "@/app/pay/SellerInfo";
import { LegalShell, LegalSectionBlock } from "../_legal-shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "이용약관", robots: { index: false, follow: false } };

/**
 * /shop/[slug]/terms — 이용약관.
 *
 * PG 심사 요건 중 '이용약관 유무' 항목이다. 센터가 실제 쓰는 전자계약서의
 * 운영 약관 조항을 그대로 노출해, 계약서와 홈페이지 내용이 어긋나지 않게 한다.
 */
export default async function ShopTermsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isValidShopSlug(slug)) notFound();

  const { data } = await supabase
    .from("crm_centers")
    .select("id, name, status")
    .eq("shop_slug", slug)
    .maybeSingle();
  const center = data as { id: number; name: string; status: string } | null;
  if (!center || center.status !== "active") notFound();

  const [sections, seller] = await Promise.all([
    loadContractSections(center.id, "terms"),
    loadSellerInfo(center.id),
  ]);

  return (
    <LegalShell
      slug={slug}
      centerName={center.name}
      heading="이용약관"
      seller={seller}
      intro={
        <p>
          본 약관은 {center.name}(이하 &lsquo;센터&rsquo;)의 시설 및 서비스 이용에 관한
          조건을 정합니다. 회원은 이용권을 결제함으로써 아래 내용에 동의한 것으로 봅니다.
          결제 취소·환불에 관한 사항은{" "}
          <b>판매 · 환불 정책</b> 페이지에 따릅니다.
        </p>
      }
    >
      {sections.length === 0 ? (
        <section className="mt-7">
          <p className="text-[13.5px] leading-relaxed text-gray-600">
            이용약관은 센터에 문의해 주세요.
          </p>
        </section>
      ) : (
        sections.map((s) => <LegalSectionBlock key={s.title} title={s.title} body={s.body} />)
      )}
    </LegalShell>
  );
}
