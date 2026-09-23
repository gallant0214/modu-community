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
};

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
    }));

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

      <SellerInfo seller={seller} />
    </main>
  );
}
