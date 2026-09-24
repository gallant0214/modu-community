import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";
import { effectiveStatus, computeCouponDiscount, type CouponDef } from "@/app/lib/crm-coupons";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/member-app/coupons?centerId=
 * 내 보유 쿠폰 목록 (표시 전용 — 사용 처리는 CRM 발급창에서만).
 * crm_coupon_issues(회원 발급건) + crm_coupons(정의) 조인.
 *  - 회수(revoked)는 제외.
 *  - 상태는 공용 effectiveStatus()로 계산: issued→active(사용가능), used, expired(expires_at 기준).
 *  - 정렬: 사용가능(만료 임박순) → 사용완료 → 만료(최신 발급순).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const centerId = Number(url.searchParams.get("centerId"));
  const productId = Number(url.searchParams.get("productId")) || null; // 있으면 상품별 사용가능 여부 계산
  const ctx = await requireMemberForCenter(request, centerId);
  if (isMemberError(ctx)) return ctx;

  // 상품별 쿠폰 사용가능 판정용 — 선택 상품의 정가/유형
  let product: { price_won: number; type: string | null; vat_included: boolean } | null = null;
  if (productId) {
    const { data: p } = await supabase
      .from("crm_products")
      .select("price_won, type, vat_included")
      .eq("id", productId)
      .eq("center_id", ctx.centerId)
      .maybeSingle();
    product = (p as { price_won: number; type: string | null; vat_included: boolean } | null) ?? null;
  }

  const { data: issues } = await supabase
    .from("crm_coupon_issues")
    .select("id, coupon_id, status, issued_at, expires_at, used_at")
    .eq("center_id", ctx.centerId)
    .eq("member_id", ctx.memberId)
    .neq("status", "revoked")
    .order("issued_at", { ascending: false });

  const couponIds = Array.from(
    new Set((issues ?? []).map((i) => i.coupon_id).filter((v): v is number => !!v))
  );
  type Def = {
    id: number;
    name: string;
    description: string | null;
    benefit_type: string;
    amount_won: number | null;
    percent: number | null;
    max_discount_won: number | null;
    min_purchase_won: number | null;
    applicable_types: string[] | null;
    gift_product_id: number | null;
  };
  const defMap = new Map<number, Def>();
  if (couponIds.length) {
    const { data: defs } = await supabase
      .from("crm_coupons")
      .select("id, name, description, benefit_type, amount_won, percent, max_discount_won, min_purchase_won, applicable_types, gift_product_id")
      .in("id", couponIds);
    for (const d of (defs ?? []) as Def[]) defMap.set(d.id, d);
  }

  // 증정 쿠폰 상품명 (gift_product_id → crm_products.name) — 회원앱에 "무엇을 무료로 받는지" 표시
  const giftProductIds = Array.from(
    new Set(
      Array.from(defMap.values())
        .map((d) => d.gift_product_id)
        .filter((v): v is number => !!v)
    )
  );
  const giftNameMap = new Map<number, string>();
  if (giftProductIds.length) {
    const { data: prods } = await supabase
      .from("crm_products")
      .select("id, name")
      .in("id", giftProductIds);
    for (const p of (prods ?? []) as { id: number; name: string }[]) giftNameMap.set(p.id, p.name);
  }

  const rank: Record<string, number> = { active: 0, used: 1, expired: 2 };
  const coupons = (issues ?? [])
    .map((i) => {
      const d = defMap.get(i.coupon_id as number);
      if (!d) return null;
      const eff = effectiveStatus({ status: i.status, expires_at: i.expires_at });
      if (eff === "revoked") return null;
      const status = eff === "used" ? "used" : eff === "expired" ? "expired" : "active";

      // 상품 선택 시(productId) 이 상품에 이 쿠폰을 쓸 수 있는지 판정
      let usable: boolean | undefined;
      let usableReason: string | undefined;
      let discountWon: number | undefined;
      if (product && status === "active") {
        const def: CouponDef = {
          id: d.id,
          name: d.name,
          benefit_type: d.benefit_type as CouponDef["benefit_type"],
          amount_won: d.amount_won,
          percent: d.percent,
          max_discount_won: d.max_discount_won,
          min_purchase_won: d.min_purchase_won ?? 0,
          gift_product_id: d.gift_product_id,
          applicable_types: d.applicable_types,
          valid_mode: "until",
          valid_days: null,
          valid_until: null,
          gift_product_name: d.gift_product_id ? giftNameMap.get(d.gift_product_id) ?? null : null,
        };
        const chk = computeCouponDiscount(def, {
          priceWon: product.price_won,
          productType: product.type,
          productId,
          vatIncluded: product.vat_included,
        });
        usable = chk.ok;
        usableReason = chk.ok ? undefined : chk.reason;
        discountWon = chk.ok ? chk.discountWon : 0;
      }

      return {
        id: i.id,
        name: d.name,
        description: d.description ?? null,
        benefitType: d.benefit_type,
        amountWon: d.amount_won ?? null,
        percent: d.percent ?? null,
        maxDiscountWon: d.max_discount_won ?? null,
        giftProductName: d.gift_product_id ? giftNameMap.get(d.gift_product_id) ?? null : null,
        expiresAt: i.expires_at,
        status,
        usedAt: i.used_at ?? null,
        issuedAt: i.issued_at,
        ...(product ? { usable: usable ?? false, usableReason: usableReason ?? null, discountWon: discountWon ?? 0 } : {}),
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => {
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      if (a.status === "active") return (a.expiresAt ?? "9999-12-31") < (b.expiresAt ?? "9999-12-31") ? -1 : 1;
      return a.issuedAt < b.issuedAt ? 1 : -1;
    });

  return NextResponse.json({ coupons });
}
