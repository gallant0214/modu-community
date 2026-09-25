import { supabase } from "@/app/lib/supabase";
import { isValidShopSlug } from "@/app/lib/shop-slug";
import {
  renderBrandOG,
  OG_SIZE,
  OG_CONTENT_TYPE,
  OG_ALT,
} from "@/app/lib/og-brand";

export const runtime = "nodejs";
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/**
 * /shop/[slug] 의 카톡·페이스북 미리보기 이미지.
 * 센터 shop_slug → 센터명 매핑 후 '이용권 구매' 브랜드 이미지.
 */
export default async function Image({ params }: { params: { slug: string } }) {
  let centerName = "모두의 지도사";
  try {
    if (isValidShopSlug(params.slug)) {
      const { data } = await supabase
        .from("crm_centers")
        .select("name, status")
        .eq("shop_slug", params.slug)
        .maybeSingle();
      if (data && data.status === "active" && data.name) centerName = data.name;
    }
  } catch {
    /* fallback */
  }
  return renderBrandOG({ centerName, kind: "shop" });
}
