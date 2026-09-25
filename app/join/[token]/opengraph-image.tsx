import { supabase } from "@/app/lib/supabase";
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
 * /join/[token] 의 카톡·페이스북 미리보기 이미지.
 * 토큰 → 센터명 매핑 후 브랜드 이미지 렌더링. 실패 시 중립 이미지.
 */
export default async function Image({ params }: { params: { token: string } }) {
  let centerName = "모두의 지도사";
  try {
    const { data: link } = await supabase
      .from("crm_center_join_links")
      .select("center_id")
      .eq("token", params.token)
      .maybeSingle();
    if (link) {
      const { data: c } = await supabase
        .from("crm_centers")
        .select("name, status")
        .eq("id", link.center_id)
        .maybeSingle();
      if (c && c.status === "active" && c.name) centerName = c.name;
    }
  } catch {
    /* fallback to default centerName */
  }
  return renderBrandOG({ centerName, kind: "invite" });
}
