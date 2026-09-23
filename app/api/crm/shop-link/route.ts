import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import { generateShopSlug } from "@/app/lib/shop-slug";

export const dynamic = "force-dynamic";

/**
 * GET  /api/crm/shop-link → 이 센터의 공개 판매 페이지 주소(없으면 즉석 발급)
 * POST /api/crm/shop-link → 주소 재발급 (기존 링크·QR 즉시 무효화)
 *
 * 터치출석 링크(/api/crm/kiosk-link)와 같은 방식. 권한은 센터 설정(settings.edit).
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  // 공개 판매 페이지 주소는 비밀이 아니다(인스타·QR 로 뿌리는 값). 센터 구성원이면 조회 가능.
  // 다만 아직 없을 때 '발급'하는 건 쓰기이므로 설정 권한이 있을 때만 한다.
  const canIssue = await ctxHasPermission(ctx, "settings.edit");

  const { data } = await supabase
    .from("crm_centers")
    .select("shop_slug")
    .eq("id", ctx.centerId)
    .maybeSingle();
  let slug = (data as { shop_slug: string | null } | null)?.shop_slug ?? null;

  if (!slug && canIssue) {
    const fresh = generateShopSlug();
    // 동시 요청 레이스 방지 — 여전히 비어 있을 때만 기록한다
    await supabase
      .from("crm_centers")
      .update({ shop_slug: fresh } as never)
      .eq("id", ctx.centerId)
      .is("shop_slug", null);
    const { data: re } = await supabase
      .from("crm_centers")
      .select("shop_slug")
      .eq("id", ctx.centerId)
      .maybeSingle();
    slug = (re as { shop_slug: string | null } | null)?.shop_slug ?? fresh;
  }

  // 아직 발급 전이고 발급 권한도 없으면 주소가 없다 — 호출 측이 버튼을 숨길 수 있게 null 로
  return NextResponse.json({ slug, path: slug ? `/shop/${slug}` : null });
}

export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "settings.edit"))) {
    return NextResponse.json({ error: "센터 설정 권한이 없습니다" }, { status: 403 });
  }

  const slug = generateShopSlug();
  const { error } = await supabase
    .from("crm_centers")
    .update({ shop_slug: slug } as never)
    .eq("id", ctx.centerId);
  if (error) {
    return NextResponse.json({ error: "주소 발급 실패", detail: error.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "shop_link.regenerate",
    entity_type: "crm_centers",
    entity_id: ctx.centerId,
    payload: {} as never,
  });

  return NextResponse.json({ slug, path: `/shop/${slug}` });
}
