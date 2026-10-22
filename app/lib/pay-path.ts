import "server-only";
import { supabase } from "@/app/lib/supabase";

/**
 * **센터 이용권 결제창 주소**를 만드는 단일 소스.
 *
 * `/store/[센터슬러그]/pay/[주문번호]` — 센터마다 고유한 결제 주소를 갖는다.
 * PG 심사에 제출하는 주소라 상품 종류별로 분리되어야 하고(센터 이용권 vs CRM 이용권),
 * 센터가 늘어나도 주소가 겹치지 않아야 한다.
 *
 * 🚨 주소를 만드는 곳이 **세 군데**다 — 회원앱/웹 주문, QR 셀프가입 주문, 그리고
 *    결제 페이지가 done 으로 넘길 때. 한 곳이라도 빠뜨리면 그 경로의 결제만 깨진다.
 *    그래서 문자열을 손으로 조립하지 말고 반드시 이 함수를 쓴다.
 *
 * 🚨 최상단(`/[센터슬러그]/...`)에 두지 않는다. 최상단 메뉴가 늘면 센터 슬러그와
 *    충돌한다. (`/shop/[slug]` 를 `/shop` 아래 둔 것과 같은 이유)
 */

/** 경로에 쓸 센터 슬러그. pay_slug 가 없으면 안전한 값으로 떨어진다 */
export function payPathSlug(center: {
  id: number;
  pay_slug?: string | null;
  shop_slug?: string | null;
}): string {
  return center.pay_slug?.trim() || center.shop_slug?.trim() || String(center.id);
}

/** 센터 id 로 슬러그를 조회한다 (주문 생성 시) */
export async function payPathSlugForCenter(centerId: number): Promise<string> {
  const { data } = await supabase
    .from("crm_centers")
    .select("id, pay_slug, shop_slug")
    .eq("id", centerId)
    .maybeSingle();
  const c = data as { id: number; pay_slug: string | null; shop_slug: string | null } | null;
  return c ? payPathSlug(c) : String(centerId);
}

/** 결제 페이지 경로 (쿼리 제외) */
export function payPath(centerSlug: string, orderUid: string): string {
  return `/store/${centerSlug}/pay/${orderUid}`;
}

/** 결제 완료 페이지 경로 */
export function payDonePath(centerSlug: string, orderUid: string): string {
  return `${payPath(centerSlug, orderUid)}/done`;
}

/**
 * 옛 주소(`/pay/[주문]`)로 들어온 요청을 어디로 보낼지 — 주문의 센터를 찾아 새 경로를 만든다.
 * 🚨 경로를 바꾸면 **이미 발급된 결제 링크가 전부 깨진다**(주문 토큰 35분, 문자로 보낸 링크,
 *    PG 심사에 제출한 주소). 그래서 옛 주소를 지우지 않고 여기로 넘긴다.
 */
export async function legacyPayRedirect(orderUid: string): Promise<string | null> {
  const { data } = await supabase
    .from("crm_orders")
    .select("center_id")
    .eq("order_uid", orderUid)
    .maybeSingle();
  const centerId = (data as { center_id: number } | null)?.center_id;
  if (!centerId) return null;
  return payPath(await payPathSlugForCenter(centerId), orderUid);
}
