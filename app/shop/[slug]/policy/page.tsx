import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase";
import { isValidShopSlug } from "@/app/lib/shop-slug";
import { PRODUCT_SELECT, type SellableProduct } from "@/app/lib/member-purchase";
import { isOnlineSellable } from "@/app/lib/member-checkout";
import SellerInfo, { loadSellerInfo, DEFAULT_REFUND_POLICY } from "@/app/pay/SellerInfo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "판매 · 환불 정책",
  robots: { index: false, follow: false },
};

const UNIT_LABEL: Record<string, string> = { day: "일", week: "주", month: "개월", year: "년" };

/** 상품의 서비스 제공기간을 개월로 환산 — 최대 기간을 뽑아 페이지에 명시한다 */
function toMonths(value: number | null, unit: string | null): number {
  if (!value) return 0;
  if (unit === "month") return value;
  if (unit === "year") return value * 12;
  if (unit === "week") return Math.ceil((value * 7) / 30);
  return Math.ceil(value / 30); // day
}

/**
 * /shop/[slug]/policy — 판매·환불 정책 전용 페이지.
 *
 * PG(토스) 계약 심사가 '환불정책을 확인할 수 있는 URL' 을 따로 요구한다.
 * 결제 페이지 하단에만 있으면 심사원이 결제를 진행해야만 볼 수 있어 URL 로 제출할 수 없다.
 * 서비스 제공기간도 여기 명시한다 — "구매자가 서비스제공기간을 인지할 수 있도록
 * 상품페이지 내에 명확히 기재" 가 심사 요건이다.
 */
export default async function ShopPolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isValidShopSlug(slug)) notFound();

  const { data: centerRow } = await supabase
    .from("crm_centers")
    .select("id, name, status")
    .eq("shop_slug", slug)
    .maybeSingle();
  const center = centerRow as { id: number; name: string; status: string } | null;
  if (!center || center.status !== "active") notFound();

  const { data } = await supabase
    .from("crm_products")
    .select(PRODUCT_SELECT)
    .eq("center_id", center.id)
    .eq("status", "active")
    .eq("sale_enabled", true)
    .eq("online_sale_enabled", true)
    .is("trainer_member_id", null);
  const products = ((data ?? []) as unknown as SellableProduct[]).filter(isOnlineSellable);

  const maxMonths = products.reduce(
    (m, p) => Math.max(m, toMonths(p.duration_value, p.duration_unit)),
    0
  );
  const maxPrice = products.reduce((m, p) => Math.max(m, p.price_won || 0), 0);
  const seller = await loadSellerInfo(center.id);

  return (
    <main className="mx-auto min-h-screen w-full max-w-lg bg-white px-5 pb-16 pt-8">
      <header>
        <p className="text-xs font-semibold text-blue-600">판매 · 환불 정책</p>
        <h1 className="mt-1 text-xl font-bold text-gray-900">{center.name}</h1>
      </header>

      <Section title="판매 상품">
        <p>
          헬스장 이용권(회원권)과 개인·그룹 수업 수강권, 운동복 대여권을 판매합니다. 모두 센터에서
          직접 이용하시는 <b>무형의 서비스</b>이며 배송되는 물품은 없습니다.
        </p>
        <p className="mt-2">
          결제가 완료되면 이용권이 <b>즉시 등록</b>되며, 회원 앱과 센터 프런트에서 바로 확인하실 수
          있습니다.
        </p>
        {maxPrice > 0 && (
          <p className="mt-2">
            단건 결제 최고가는 <b>{maxPrice.toLocaleString()}원</b>입니다.
          </p>
        )}
      </Section>

      <Section title="서비스 제공기간">
        <p>
          결제일로부터 이용권에 표시된 기간 동안 서비스가 제공됩니다. 현재 판매 중인 상품의{" "}
          <b>최대 제공기간은 {maxMonths > 0 ? `${maxMonths}개월` : "상품별 표시 기간"}</b>입니다.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {products
            .filter((p) => p.duration_value && p.duration_unit)
            .slice(0, 20)
            .map((p) => (
              <li key={p.id}>
                {p.name} — {p.duration_value}
                {UNIT_LABEL[p.duration_unit ?? "day"] ?? ""} 이용
              </li>
            ))}
        </ul>
        <p className="mt-2 text-gray-500">
          횟수제 수강권은 기간이 아닌 <b>남은 횟수</b>를 모두 사용할 때까지 이용하실 수 있습니다.
        </p>
      </Section>

      <Section title="환불·해지 규정">
        <p className="whitespace-pre-line">{seller?.refundPolicy || DEFAULT_REFUND_POLICY}</p>
        <p className="mt-3 text-gray-500">
          환불 요청은 아래 연락처 또는 이메일로 접수해 주세요. 결제하신 수단으로 환불됩니다.
        </p>
      </Section>

      <Section title="결제 수단">
        <p>신용·체크카드와 계좌이체로 결제하실 수 있습니다.</p>
      </Section>

      <div className="mt-8">
        <Link
          href={`/shop/${slug}`}
          className="inline-block rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white"
        >
          이용권 보러가기
        </Link>
      </div>

      <SellerInfo seller={seller} hideRefundPolicy />
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="mb-2 text-sm font-bold text-gray-900">{title}</h2>
      <div className="text-[13.5px] leading-relaxed text-gray-600">{children}</div>
    </section>
  );
}
