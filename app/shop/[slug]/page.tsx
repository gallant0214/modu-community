import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabase } from "@/app/lib/supabase";
import { isValidShopSlug } from "@/app/lib/shop-slug";
import { PRODUCT_SELECT, type SellableProduct } from "@/app/lib/member-purchase";
import { isOnlineSellable, onlineSalesEnabled } from "@/app/lib/member-checkout";
import SellerInfo, { loadSellerInfo } from "@/app/pay/SellerInfo";
import ShopClient, { type ShopProduct } from "./ShopClient";

export const dynamic = "force-dynamic";

/** 상품 유형 표시명 — 회원이 보는 말로 */
const TYPE_LABEL: Record<string, string> = {
  membership: "회원권",
  personal: "개인 레슨",
  group: "그룹 레슨",
  class: "클래스",
  apparel: "운동복",
};

/** 상품 기간을 개월로 환산 — 구매 안내에 최대 제공기간을 명시하려고 쓴다 */
function toMonths(value: number | null, unit: string | null): number {
  if (!value) return 0;
  if (unit === "month") return value;
  if (unit === "year") return value * 12;
  if (unit === "week") return Math.ceil((value * 7) / 30);
  return Math.ceil(value / 30);
}

async function loadCenter(slug: string) {
  if (!isValidShopSlug(slug)) return null;
  const { data } = await supabase
    .from("crm_centers")
    .select("id, name, status")
    .eq("shop_slug", slug)
    .maybeSingle();
  const c = data as { id: number; name: string; status: string } | null;
  if (!c || c.status !== "active") return null;
  return c;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const center = await loadCenter(slug);
  if (!center) return { title: "판매 페이지" };
  return {
    title: `${center.name} 이용권 구매`,
    description: `${center.name} 회원권·수강권을 온라인으로 결제하고 바로 등록하세요.`,
    // 공개 링크지만 검색 노출은 센터가 원할 때 열기로 한다
    robots: { index: false, follow: false },
  };
}

/**
 * /shop/[slug] — 센터별 공개 판매 페이지.
 *
 * 상품·가격·판매자 정보는 **로그인 없이** 보인다(PG 심사원이 열어봐야 하고,
 * 인스타·QR 로 뿌리는 주소이기도 하다). 구매 단계에서만 로그인을 요구한다.
 */
export default async function ShopPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const center = await loadCenter(slug);
  if (!center) notFound();

  const { data } = await supabase
    .from("crm_products")
    .select(PRODUCT_SELECT)
    .eq("center_id", center.id)
    .eq("status", "active")
    .eq("sale_enabled", true)
    .is("trainer_member_id", null) // 강사 개인 상품은 온라인 판매 대상이 아님
    .order("type")
    .order("price_won");

  const products: ShopProduct[] = ((data ?? []) as unknown as SellableProduct[])
    .filter(isOnlineSellable)
    .map((p) => ({
      id: p.id,
      type: p.type,
      typeLabel: TYPE_LABEL[p.type] ?? p.type,
      name: p.name,
      description: p.description,
      priceWon: p.price_won,
      totalSessions: p.total_sessions,
      sessionMinutes: p.session_minutes,
      durationValue: p.duration_value,
      durationUnit: p.duration_unit,
      mileageEarn: p.mileage_earn,
      billingMode: p.billing_mode,
      eligibility: p.online_eligibility || "any",
      /** 단독 구매 불가 — 이용권에 곁들여 담는 상품 */
      addon: p.type === "apparel",
    }));

  const maxMonths = products.reduce(
    (m, p) => Math.max(m, toMonths(p.durationValue, p.durationUnit)),
    0
  );
  const seller = await loadSellerInfo(center.id);

  return (
    <main className="mx-auto min-h-screen w-full max-w-lg bg-white px-5 pb-16 pt-8">
      <header>
        <p className="text-xs font-semibold text-blue-600">이용권 구매</p>
        <h1 className="mt-1 text-xl font-bold text-gray-900">{center.name}</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          결제하시면 이용권이 바로 등록됩니다. 회원 앱에서 바로 확인하실 수 있어요.
        </p>
      </header>

      {!onlineSalesEnabled() && (
        <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          온라인 결제 준비 중입니다. 구매는 센터로 문의해주세요.
        </p>
      )}

      <ShopClient
        centerId={center.id}
        centerName={center.name}
        products={products}
        salesEnabled={onlineSalesEnabled()}
      />

      {/* 🚨 KG이니시스 사이트 검수 3번 — "상품 상세페이지에 서비스 제공기간, 교환, 환불,
          취소 규정 기재". 정책 전문을 따로 두는 것만으로는 반려되므로, 상품이 보이는
          이 페이지에서 네 항목이 그대로 읽혀야 한다. 전문은 /shop/[slug]/policy. */}
      <section className="mt-8 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
        <h2 className="text-sm font-bold text-gray-900">구매 안내</h2>
        <dl className="mt-3 space-y-2.5 text-[13px] leading-relaxed">
          <Guide label="서비스 제공시기">
            결제 완료 즉시 이용권이 등록되어 바로 이용하실 수 있습니다. 배송되는 물품은 없습니다.
          </Guide>
          <Guide label="서비스 제공기간">
            각 상품에 표시된 기간
            {maxMonths > 0 ? ` 동안 제공되며, 최대 ${maxMonths}개월입니다` : " 동안 제공됩니다"}.
            횟수제 수강권은 남은 횟수를 모두 사용할 때까지 이용하실 수 있습니다.
          </Guide>
          <Guide label="주문 취소 · 청약철회">
            이용을 시작하지 않았다면 결제일로부터 7일 이내에 위약금 없이 전액 환불되며, 접수 후
            3영업일 이내에 결제하신 카드로 환급됩니다.
          </Guide>
          <Guide label="교환 · 상품 변경">
            무형의 서비스라 물품 교환 절차는 없습니다. 이용 시작 전이라면 다른 기간·종류의
            이용권으로 변경하실 수 있고, 차액은 추가 결제 또는 부분취소로 정산합니다.
          </Guide>
          <Guide label="환불">
            이용을 시작한 뒤에는 이용한 기간에 해당하는 금액과 위약금을 공제한 잔액을 환불해
            드립니다. 자세한 기준은 아래 환불·해지 규정을 확인해 주세요.
          </Guide>
        </dl>
        <a
          href={`/shop/${slug}/policy`}
          className="mt-3 inline-block text-[13px] font-bold text-blue-600 underline"
        >
          판매 · 환불 정책 전문 보기
        </a>
      </section>

      <SellerInfo seller={seller} slug={slug} />
    </main>
  );
}

function Guide({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-bold text-gray-800">{label}</dt>
      <dd className="mt-0.5 text-gray-600">{children}</dd>
    </div>
  );
}
