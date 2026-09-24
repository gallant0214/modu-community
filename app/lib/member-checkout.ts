/**
 * 온라인 결제 견적(quote) — 정가 · 쿠폰 · 마일리지 · 최종 결제액의 **단일 소스**.
 *
 * 견적 화면 / 주문 생성 / 결제 승인이 전부 이 함수를 거친다.
 * 세 곳이 각자 계산하면 반드시 어긋나고, 어긋나는 순간 돈이 틀어진다.
 *
 * 🚨 클라이언트가 보낸 금액은 어디서도 쓰지 않는다. 받는 건 "무엇을 쓰겠다"는 의사뿐:
 *    productId / couponIssueId / mileageUse(희망액). 금액은 전부 서버가 다시 만든다.
 */
import { supabase } from "@/app/lib/supabase";
import { computeCouponDiscount, effectiveStatus, benefitText, type CouponDef } from "@/app/lib/crm-coupons";
import type { SellableProduct } from "@/app/lib/member-purchase";

/** pending 주문이 살아있는 시간 — 지나면 쿠폰·마일리지 선점이 풀린다 */
export const ORDER_TTL_MINUTES = 30;

/**
 * 온라인 판매 스위치.
 *
 * 🚨 기본은 **꺼짐**이다. PG 계약 전에는 토스 공개 테스트 키로 동작하는데,
 *    그 상태로 열어두면 가짜 결제로 진짜 이용권이 발급된다.
 *
 *   ONLINE_SALES_ENABLED=1  → 테스트 키로도 판매 허용 (운영 DB 로 리허설할 때만)
 *   실계약 키(TOSS_SECRET_KEY=live_...)가 꽂히면 자동으로 열린다
 */
export function onlineSalesEnabled(): boolean {
  if (process.env.ONLINE_SALES_ENABLED === "1") return true;
  const k = process.env.TOSS_SECRET_KEY;
  return !!k && !k.startsWith("test_");
}

/** 판매가 꺼져 있을 때 회원에게 보여줄 문구 */
export const SALES_DISABLED_MESSAGE = "온라인 결제는 준비 중이에요. 센터로 문의해주세요.";

/**
 * 온라인(홈페이지·회원앱)에서 팔 수 있는 상품 유형 — 1차 오픈 범위.
 * 락커는 자리 배정이 수동이라, 운동복·물품은 재고 개념이 없어 제외했다.
 * 넓힐 때는 member-purchase.ts 의 발급 분기가 그 유형을 처리하는지 먼저 확인할 것.
 */
export const ONLINE_SELLABLE_TYPES = new Set(["membership", "personal", "group", "class"]);

/** crm_members.registration_type 값 — 한글로 저장된다 */
export type RegistrationType = "신규" | "재등록" | null;

/**
 * 이 회원이 이 상품을 살 수 있는가.
 *
 * 현장에서는 직원이 신규·재등록을 보고 발급하지만 온라인은 확인하는 사람이 없다.
 * 안 막으면 신규 회원이 더 싼 재등록가로 결제해 간다.
 * 구분이 아직 없는 회원(null)은 신규로 본다 — 등록 이력이 없다는 뜻이므로.
 */
export function eligibilityError(
  p: SellableProduct,
  regType: RegistrationType
): string | null {
  const want = p.online_eligibility || "any";
  if (want === "any") return null;
  const isRejoin = regType === "재등록";
  if (want === "new" && isRejoin) {
    return "신규 회원 전용 상품이에요";
  }
  if (want === "rejoin" && !isRejoin) {
    return "재등록 회원 전용 상품이에요. 처음 등록이시면 신규 상품을 선택해주세요";
  }
  return null;
}

export function isOnlineSellable(p: SellableProduct): boolean {
  return (
    // 🚨 온라인 전용 스위치. 기본 꺼짐이라 센터가 켠 상품만 노출된다.
    //    이게 없으면 테스트 상품·직원 단가·바우처 상품까지 홈페이지에 다 걸린다.
    p.online_sale_enabled === true &&
    // 상품관리에서 '판매중지'한 상품은 온라인에서도 팔지 않는다
    p.sale_enabled === true &&
    p.status === "active" &&
    Number(p.price_won) > 0 &&
    ONLINE_SELLABLE_TYPES.has(p.type)
  );
}

export interface QuoteCoupon {
  issueId: number;
  name: string;
  benefit: string;
  discountWon: number;
  /** 증정 쿠폰(상품을 통째로 0원) 여부 */
  isGift: boolean;
}

export interface CheckoutQuote {
  ok: boolean;
  error?: string;
  /** 쿠폰만 적용 불가한 경우 — 결제 자체는 가능하므로 ok=true 와 함께 온다 */
  couponError?: string;
  listPriceWon: number;
  couponDiscountWon: number;
  mileageUsedWon: number;
  /** 최종 결제액. 0 이면 PG 를 거치지 않고 바로 발급한다 */
  amountWon: number;
  /** 구매 적립 예정 마일리지 */
  mileageEarn: number;
  /** 회원 보유 마일리지 */
  mileageBalance: number;
  /** 결제 대기중인 다른 주문이 잡고 있는 마일리지 */
  mileageHeld: number;
  /** 이 주문에 쓸 수 있는 최대 마일리지 */
  mileageMax: number;
  coupon?: QuoteCoupon;
}

/**
 * 아직 결제되지 않은 내 주문들이 선점하고 있는 마일리지 합.
 * 결제창을 두 개 띄워 같은 마일리지를 두 번 쓰는 걸 막는다.
 */
export async function heldMileage(opts: {
  centerId: number;
  memberId: number;
  excludeOrderId?: number;
}): Promise<number> {
  const { data } = await supabase
    .from("crm_orders")
    .select("id, mileage_used")
    .eq("center_id", opts.centerId)
    .eq("member_id", opts.memberId)
    .eq("status", "pending")
    .gt("mileage_used", 0)
    .gt("expires_at", new Date().toISOString());
  return ((data ?? []) as { id: number; mileage_used: number | null }[])
    .filter((o) => o.id !== opts.excludeOrderId)
    .reduce((s, o) => s + (o.mileage_used ?? 0), 0);
}

/** 쿠폰 정의 + 증정 상품명까지 채워서 읽는다 */
async function loadCouponDef(couponId: number): Promise<CouponDef | null> {
  const { data } = await supabase.from("crm_coupons").select("*").eq("id", couponId).maybeSingle();
  const coupon = data as unknown as CouponDef | null;
  if (!coupon) return null;
  if (coupon.gift_product_id) {
    const { data: gp } = await supabase
      .from("crm_products")
      .select("name")
      .eq("id", coupon.gift_product_id)
      .maybeSingle();
    coupon.gift_product_name = (gp as { name?: string } | null)?.name ?? null;
  }
  return coupon;
}

/**
 * 결제 견적. 쿠폰이 적용 불가여도 **결제 자체는 막지 않고** couponError 로 알려준다
 * (화면에서 쿠폰만 빼고 계속 진행할 수 있게).
 */
export async function quoteOrder(opts: {
  centerId: number;
  memberId: number;
  product: SellableProduct;
  couponIssueId?: number | null;
  /** 회원이 쓰겠다고 한 마일리지(희망액). 한도를 넘으면 한도로 깎인다 */
  mileageUse?: number | null;
  /** 재견적 시 자기 자신의 hold 는 제외 */
  excludeOrderId?: number;
}): Promise<CheckoutQuote> {
  const { centerId, memberId, product } = opts;
  const listPriceWon = Math.max(0, Math.floor(product.price_won || 0));

  const base: CheckoutQuote = {
    ok: true,
    listPriceWon,
    couponDiscountWon: 0,
    mileageUsedWon: 0,
    amountWon: listPriceWon,
    mileageEarn: Math.max(0, Math.floor(product.mileage_earn || 0)),
    mileageBalance: 0,
    mileageHeld: 0,
    mileageMax: 0,
  };

  if (!isOnlineSellable(product)) {
    return { ...base, ok: false, error: "지금은 구매할 수 없는 상품이에요" };
  }

  // 신규/재등록 자격 — 금액을 계산하기 전에 막는다
  const { data: memRow } = await supabase
    .from("crm_members")
    .select("registration_type")
    .eq("id", memberId)
    .eq("center_id", centerId)
    .maybeSingle();
  const regType = ((memRow as { registration_type?: string | null } | null)?.registration_type ??
    null) as RegistrationType;
  const eligErr = eligibilityError(product, regType);
  if (eligErr) {
    return { ...base, ok: false, error: eligErr };
  }

  /* ── 쿠폰 ───────────────────────────────────────────── */
  let coupon: QuoteCoupon | undefined;
  let couponError: string | undefined;
  if (opts.couponIssueId) {
    const { data: issueRow } = await supabase
      .from("crm_coupon_issues")
      .select("id, center_id, member_id, coupon_id, status, expires_at")
      .eq("id", opts.couponIssueId)
      .maybeSingle();
    const issue = issueRow as {
      id: number;
      center_id: number;
      member_id: number;
      coupon_id: number;
      status: string;
      expires_at: string | null;
    } | null;

    if (!issue || issue.center_id !== centerId || issue.member_id !== memberId) {
      couponError = "쿠폰을 찾을 수 없어요";
    } else if (effectiveStatus(issue) !== "issued") {
      const st = effectiveStatus(issue);
      couponError = st === "used" ? "이미 사용된 쿠폰이에요" : st === "revoked" ? "회수된 쿠폰이에요" : "기간이 지난 쿠폰이에요";
    } else {
      const def = await loadCouponDef(issue.coupon_id);
      if (!def) {
        couponError = "쿠폰 정보를 찾을 수 없어요";
      } else {
        const check = computeCouponDiscount(def, {
          priceWon: listPriceWon,
          productType: product.type,
          productId: product.id,
        });
        if (!check.ok) {
          couponError = check.reason ?? "적용할 수 없는 쿠폰이에요";
        } else {
          // 다른 살아있는 주문이 이미 이 쿠폰을 물고 있으면 중복 적용 금지
          const { data: taken } = await supabase
            .from("crm_orders")
            .select("id")
            .eq("coupon_issue_id", issue.id)
            .in("status", ["pending", "paid"])
            .limit(1);
          const takenId = (taken ?? [])[0] as { id: number } | undefined;
          if (takenId && takenId.id !== opts.excludeOrderId) {
            couponError = "결제 진행 중인 다른 주문에 쓰인 쿠폰이에요";
          } else {
            coupon = {
              issueId: issue.id,
              name: def.name,
              benefit: benefitText(def),
              discountWon: check.discountWon,
              isGift: def.benefit_type === "gift",
            };
          }
        }
      }
    }
  }

  const couponDiscountWon = coupon?.discountWon ?? 0;
  const afterCoupon = Math.max(0, listPriceWon - couponDiscountWon);

  /* ── 마일리지 ───────────────────────────────────────── */
  const { data: mem } = await supabase
    .from("crm_members")
    .select("mileage")
    .eq("id", memberId)
    .eq("center_id", centerId)
    .maybeSingle();
  const mileageBalance = Math.max(0, Math.floor((mem as { mileage?: number } | null)?.mileage ?? 0));
  const mileageHeld = await heldMileage({ centerId, memberId, excludeOrderId: opts.excludeOrderId });
  const available = Math.max(0, mileageBalance - mileageHeld);

  // 상품 설정에서 마일리지 사용을 막아둔 경우 0
  const mileageAllowed = product.mileage_usable !== false;
  const mileageMax = mileageAllowed ? Math.min(available, afterCoupon) : 0;
  const mileageUsedWon = Math.max(0, Math.min(Math.floor(opts.mileageUse || 0), mileageMax));

  const amountWon = Math.max(0, afterCoupon - mileageUsedWon);

  return {
    ok: true,
    couponError,
    listPriceWon,
    couponDiscountWon,
    mileageUsedWon,
    amountWon,
    mileageEarn: base.mileageEarn,
    mileageBalance,
    mileageHeld,
    mileageMax,
    coupon,
  };
}

/**
 * 결제 확정 시 마일리지 정산 — 적립과 사용을 한 번에 반영한다.
 * 🚨 잔고만 바꾸고 원장(crm_member_mileage_logs)을 빼먹으면 회원앱 내역에 안 뜬다.
 */
export async function settleOrderMileage(opts: {
  centerId: number;
  memberId: number;
  earned: number;
  used: number;
}): Promise<number | null> {
  const earned = Math.max(0, Math.floor(opts.earned || 0));
  const used = Math.max(0, Math.floor(opts.used || 0));
  if (earned === 0 && used === 0) return null;

  const { data: mem } = await supabase
    .from("crm_members")
    .select("mileage")
    .eq("id", opts.memberId)
    .eq("center_id", opts.centerId)
    .maybeSingle();
  const balance = Math.max(0, Math.floor((mem as { mileage?: number } | null)?.mileage ?? 0));
  const afterEarn = balance + earned;
  const next = Math.max(0, afterEarn - used);

  await supabase
    .from("crm_members")
    .update({ mileage: next } as never)
    .eq("id", opts.memberId)
    .eq("center_id", opts.centerId);

  const logs: Record<string, unknown>[] = [];
  if (earned > 0)
    logs.push({ center_id: opts.centerId, member_id: opts.memberId, delta: earned, reason: "earn", balance_after: afterEarn });
  if (used > 0)
    logs.push({ center_id: opts.centerId, member_id: opts.memberId, delta: -used, reason: "use", balance_after: next });
  if (logs.length) await supabase.from("crm_member_mileage_logs").insert(logs as never);

  return next;
}

/** 결제로 빠져나간 마일리지를 되돌린다(환불·발급 실패). 원장에 반대 부호로 남긴다 */
export async function refundOrderMileage(opts: {
  centerId: number;
  memberId: number;
  /** 되돌려줄 사용액 */
  used: number;
  /** 회수할 적립액 */
  earned: number;
}): Promise<number | null> {
  const used = Math.max(0, Math.floor(opts.used || 0));
  const earned = Math.max(0, Math.floor(opts.earned || 0));
  if (used === 0 && earned === 0) return null;

  const { data: mem } = await supabase
    .from("crm_members")
    .select("mileage")
    .eq("id", opts.memberId)
    .eq("center_id", opts.centerId)
    .maybeSingle();
  const balance = Math.max(0, Math.floor((mem as { mileage?: number } | null)?.mileage ?? 0));
  const afterReturn = balance + used;
  const next = Math.max(0, afterReturn - earned);

  await supabase
    .from("crm_members")
    .update({ mileage: next } as never)
    .eq("id", opts.memberId)
    .eq("center_id", opts.centerId);

  const logs: Record<string, unknown>[] = [];
  if (used > 0)
    logs.push({ center_id: opts.centerId, member_id: opts.memberId, delta: used, reason: "order_refund", balance_after: afterReturn });
  if (earned > 0)
    logs.push({ center_id: opts.centerId, member_id: opts.memberId, delta: -earned, reason: "order_refund", balance_after: next });
  if (logs.length) await supabase.from("crm_member_mileage_logs").insert(logs as never);

  return next;
}

/**
 * 시한이 지난 pending 주문을 정리한다 — 쿠폰·마일리지 선점을 풀어주는 게 목적.
 * 주문 생성 직전(해당 회원만)과 크론(센터 전체)에서 호출한다.
 */
export async function expireStaleOrders(opts: {
  centerId?: number;
  memberId?: number;
  limit?: number;
}): Promise<number> {
  // 🚨 pending 만 정리한다. processing 은 지금 발급 중이라 건드리면 이중 발급·유실이 난다.
  let q = supabase
    .from("crm_orders")
    .select("id, coupon_issue_id")
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString())
    .limit(opts.limit ?? 200);
  if (opts.centerId) q = q.eq("center_id", opts.centerId);
  if (opts.memberId) q = q.eq("member_id", opts.memberId);

  const { data } = await q;
  const stale = (data ?? []) as { id: number; coupon_issue_id: number | null }[];
  if (stale.length === 0) return 0;

  await supabase
    .from("crm_orders")
    .update({
      status: "canceled",
      fail_reason: "결제 시간 초과",
      updated_at: new Date().toISOString(),
    } as never)
    .in(
      "id",
      stale.map((o) => o.id)
    )
    .eq("status", "pending"); // 그 사이 결제됐으면 건드리지 않는다

  // 잠가뒀던 쿠폰을 다시 쓸 수 있게 돌려준다
  const { releaseCoupon } = await import("@/app/lib/crm-coupons-server");
  for (const o of stale) {
    if (o.coupon_issue_id) await releaseCoupon(o.coupon_issue_id);
  }
  return stale.length;
}
