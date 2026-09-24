/**
 * 쿠폰 사용 처리(서버 전용).
 *
 * 발급 라우트(수강권/회원권/대여권)에서 이 순서로 쓴다 — 이중 사용을 막는 핵심:
 *   1) claimCoupon()        쿠폰을 먼저 '사용'으로 잠근다 (status='issued' 조건부 UPDATE → 동시에 두 번 못 씀)
 *   2) 상품 INSERT
 *   3a) 성공 → finalizeCouponUse()  어느 결제에 썼는지 연결
 *   3b) 실패 → releaseCoupon()      다시 '사용 가능'으로 되돌림
 */
import { supabase } from "@/app/lib/supabase";
import { computeCouponDiscount, effectiveStatus, type CouponDef } from "@/app/lib/crm-coupons";

export interface ClaimResult {
  ok: boolean;
  error?: string;
  issueId?: number;
  discountWon?: number;
}

export async function claimCoupon(opts: {
  centerId: number;
  memberId: number;
  issueId: number;
  /** 쿠폰 적용 전 정가 */
  originalPriceWon: number;
  /** 실제로 깎아준 총 할인액(쿠폰 + 수동 할인) — 쿠폰 기록은 이 값을 넘지 않는다 */
  totalDiscountWon: number;
  productType?: string | null;
  productId?: number | null;
  /** 상품 가격이 부가세 포함가인지 — 정률 쿠폰 기준액 계산에 쓴다 */
  vatIncluded?: boolean;
  actor: { uid?: string | null; name?: string | null };
}): Promise<ClaimResult> {
  const { data: issue } = await supabase
    .from("crm_coupon_issues")
    .select("id, center_id, member_id, coupon_id, status, expires_at")
    .eq("id", opts.issueId)
    .maybeSingle();
  const iss = issue as {
    id: number;
    center_id: number;
    member_id: number;
    coupon_id: number;
    status: string;
    expires_at: string | null;
  } | null;
  if (!iss || iss.center_id !== opts.centerId) return { ok: false, error: "쿠폰을 찾을 수 없어요" };
  if (iss.member_id !== opts.memberId) return { ok: false, error: "이 회원의 쿠폰이 아니에요" };

  const st = effectiveStatus(iss);
  if (st !== "issued") {
    const why = st === "used" ? "이미 사용된" : st === "revoked" ? "회수된" : "기간이 지난";
    return { ok: false, error: `${why} 쿠폰이에요` };
  }

  const { data: cp } = await supabase
    .from("crm_coupons")
    .select("*")
    .eq("id", iss.coupon_id)
    .maybeSingle();
  const coupon = cp as unknown as CouponDef | null;
  if (!coupon) return { ok: false, error: "쿠폰 정보를 찾을 수 없어요" };
  if (coupon.gift_product_id) {
    const { data: gp } = await supabase
      .from("crm_products")
      .select("name")
      .eq("id", coupon.gift_product_id)
      .maybeSingle();
    coupon.gift_product_name = (gp as { name?: string } | null)?.name ?? null;
  }

  const check = computeCouponDiscount(coupon, {
    priceWon: opts.originalPriceWon,
    productType: opts.productType,
    productId: opts.productId,
    vatIncluded: opts.vatIncluded,
  });
  if (!check.ok) return { ok: false, error: check.reason ?? "적용할 수 없는 쿠폰이에요" };

  const applied = Math.max(0, Math.min(check.discountWon, Math.floor(opts.totalDiscountWon || 0)));

  // 🚨 조건부 UPDATE — 동시에 두 결제가 같은 쿠폰을 잡아도 한쪽만 성공한다
  const { data: locked } = await supabase
    .from("crm_coupon_issues")
    .update({
      status: "used",
      used_at: new Date().toISOString(),
      used_by_uid: opts.actor.uid ?? null,
      used_by_name: opts.actor.name ?? null,
      original_price_won: Math.floor(opts.originalPriceWon || 0),
      discount_applied_won: applied,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", iss.id)
    .eq("status", "issued")
    .select("id");
  if (!locked || locked.length === 0) return { ok: false, error: "이미 사용된 쿠폰이에요" };

  return { ok: true, issueId: iss.id, discountWon: applied };
}

/** 발급 성공 후 — 쿠폰이 어느 결제에 쓰였는지 연결 */
export async function finalizeCouponUse(issueId: number, refKind: string, refId: number) {
  await supabase
    .from("crm_coupon_issues")
    .update({ used_ref_kind: refKind, used_ref_id: refId, updated_at: new Date().toISOString() } as never)
    .eq("id", issueId);
}

/** 발급 실패 시 — 잠갔던 쿠폰을 다시 사용 가능으로 */
export async function releaseCoupon(issueId: number) {
  await supabase
    .from("crm_coupon_issues")
    .update({
      status: "issued",
      used_at: null,
      used_by_uid: null,
      used_by_name: null,
      original_price_won: null,
      discount_applied_won: null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", issueId)
    .eq("status", "used")
    .is("used_ref_id", null);
}

/**
 * 환불로 결제가 되돌아갔을 때 쿠폰을 다시 쓸 수 있게 돌려준다.
 *
 * releaseCoupon() 과 달리 **이미 결제에 연결된(used_ref_id 가 있는) 쿠폰도** 푼다.
 * releaseCoupon 은 "발급하다 실패해서 롤백" 용이라 연결된 건을 일부러 건드리지 않는데,
 * 환불은 그 결제 자체가 없어진 것이라 쿠폰을 회원에게 돌려주는 게 맞다.
 * (2026-09-24: 환불 후에도 쿠폰이 '사용 완료' 로 남아 못 쓰게 되던 문제)
 */
export async function restoreCouponAfterRefund(issueId: number): Promise<boolean> {
  const { data } = await supabase
    .from("crm_coupon_issues")
    .update({
      status: "issued",
      used_at: null,
      used_by_uid: null,
      used_by_name: null,
      used_ref_kind: null,
      used_ref_id: null,
      original_price_won: null,
      discount_applied_won: null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", issueId)
    .eq("status", "used")
    .select("id");
  return (data ?? []).length > 0;
}

/**
 * 이 결제에 쓰인 쿠폰을 찾는다.
 *  · 온라인 주문이면 주문에 기록된 쿠폰
 *  · 직원 발급이면 발급된 상품(수강권/회원권/대여권)에 연결된 쿠폰
 */
export async function findCouponIssueForPayment(opts: {
  centerId: number;
  orderId: number | null;
  productKind: string | null;
  productId: number | null;
}): Promise<number | null> {
  if (opts.orderId) {
    const { data } = await supabase
      .from("crm_orders")
      .select("coupon_issue_id")
      .eq("id", opts.orderId)
      .maybeSingle();
    const id = (data as { coupon_issue_id: number | null } | null)?.coupon_issue_id ?? null;
    if (id) return id;
  }
  if (opts.productKind && opts.productId) {
    const { data } = await supabase
      .from("crm_coupon_issues")
      .select("id")
      .eq("center_id", opts.centerId)
      .eq("used_ref_kind", opts.productKind)
      .eq("used_ref_id", opts.productId)
      .eq("status", "used")
      .maybeSingle();
    return (data as { id: number } | null)?.id ?? null;
  }
  return null;
}

/** 사용/회수 기록에 남길 직원 표시 이름 */
export async function staffDisplayName(centerMemberId: number | null | undefined): Promise<string | null> {
  if (!centerMemberId) return null;
  const { data } = await supabase
    .from("crm_center_members")
    .select("display_name")
    .eq("id", centerMemberId)
    .maybeSingle();
  return (data as { display_name?: string } | null)?.display_name ?? null;
}
