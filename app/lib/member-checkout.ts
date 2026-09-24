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
export const ONLINE_SELLABLE_TYPES = new Set([
  "membership",
  "personal",
  "group",
  "class",
  "apparel", // 운동복 — 재고 개념이 없어 온라인 판매에 문제가 없다
]);

/**
 * 🚨 락커는 온라인에서 팔지 않는다 (2026-09-24 사용자 확정).
 *    남은 자리가 탈의실 기준 5~7개뿐이라 돈을 받고도 줄 자리가 없는 상황이 생긴다.
 *    자리 배정은 직원이 회원과 상담해 처리한다.
 */

/** 장바구니에 곁들여 담을 수 있는 유형 — 단독 구매는 막고 회원권·수강권에 붙여 판다 */
export const ADDON_TYPES = new Set(["apparel"]);

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

/* ═══════════════════════════════════════════════════════════
   장바구니 견적 — 회원권·수강권에 운동복을 곁들여 한 번에 결제
   ═══════════════════════════════════════════════════════════ */

export interface CartLineInput {
  productId: number;
  /** 같은 상품을 여러 개 담는 건 지금 지원하지 않는다 (이용권은 1개씩) */
}

export interface CartLine {
  productId: number;
  name: string;
  type: string;
  typeLabel: string;
  listPriceWon: number;
  couponDiscountWon: number;
  mileageUsedWon: number;
  amountWon: number;
  mileageEarn: number;
  /** 이 항목이 쿠폰 적용 대상인지 */
  couponTarget: boolean;
}

export interface CartQuote {
  ok: boolean;
  error?: string;
  couponError?: string;
  lines: CartLine[];
  listPriceWon: number;
  couponDiscountWon: number;
  mileageUsedWon: number;
  amountWon: number;
  mileageEarn: number;
  mileageBalance: number;
  mileageHeld: number;
  mileageMax: number;
  coupon?: QuoteCoupon;
}

const TYPE_LABEL: Record<string, string> = {
  membership: "회원권",
  personal: "개인 레슨",
  group: "그룹 레슨",
  class: "클래스",
  apparel: "운동복",
};

/**
 * 금액을 항목에 비례 배분한다. **합이 총액과 정확히 일치**하도록
 * 마지막 남은 1원까지 큰 항목부터 채운다(반올림 오차가 돈으로 새면 안 된다).
 */
function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map((v) => Math.floor(v));
  let rest = total - out.reduce((a, b) => a + b, 0);
  // 소수부가 큰 순서로 1원씩 나눠준다
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (rest <= 0) break;
    out[i] += 1;
    rest -= 1;
  }
  return out;
}

/**
 * 장바구니 견적. 단품 주문도 항목 1개짜리 장바구니로 다룬다 — 경로를 하나로 유지한다.
 *
 * 쿠폰: 적용 가능한 유형의 항목들 **합계**에 대해 계산하고 그 항목들에 비례 배분한다.
 *       (증정 쿠폰은 지정 상품이 담겨 있을 때 그 항목만 0원)
 * 마일리지: 쿠폰 적용 후 총액에 쓰고, 전 항목에 비례 배분한다.
 *       배분해 두는 이유는 **항목별 환불** 때문이다 — 운동복만 환불하면
 *       그 항목 몫의 마일리지만 돌려줘야 한다.
 */
export async function quoteCart(opts: {
  centerId: number;
  memberId: number;
  products: SellableProduct[];
  couponIssueId?: number | null;
  mileageUse?: number | null;
  excludeOrderId?: number;
}): Promise<CartQuote> {
  const { centerId, memberId, products } = opts;

  const empty: CartQuote = {
    ok: true,
    lines: [],
    listPriceWon: 0,
    couponDiscountWon: 0,
    mileageUsedWon: 0,
    amountWon: 0,
    mileageEarn: 0,
    mileageBalance: 0,
    mileageHeld: 0,
    mileageMax: 0,
  };
  if (products.length === 0) return { ...empty, ok: false, error: "상품을 선택해주세요" };

  for (const p of products) {
    if (!isOnlineSellable(p)) {
      return { ...empty, ok: false, error: `'${p.name}' 은 지금 구매할 수 없어요` };
    }
  }
  // 곁들이는 상품만 담고 이용권이 없으면 막는다
  if (products.every((p) => ADDON_TYPES.has(p.type))) {
    return { ...empty, ok: false, error: "회원권이나 수강권을 함께 선택해주세요" };
  }

  /* ── 신규/재등록 자격 ─────────────────────────────── */
  const { data: memRow } = await supabase
    .from("crm_members")
    .select("registration_type, mileage")
    .eq("id", memberId)
    .eq("center_id", centerId)
    .maybeSingle();
  const mem = memRow as { registration_type: string | null; mileage: number | null } | null;
  const regType = (mem?.registration_type ?? null) as RegistrationType;
  for (const p of products) {
    const err = eligibilityError(p, regType);
    if (err) return { ...empty, ok: false, error: `'${p.name}': ${err}` };
  }

  const listPriceWon = products.reduce((s, p) => s + Math.max(0, Math.floor(p.price_won || 0)), 0);

  /* ── 쿠폰 ─────────────────────────────────────────── */
  let coupon: QuoteCoupon | undefined;
  let couponError: string | undefined;
  let couponTargetIdx: number[] = [];
  let couponDiscountWon = 0;

  if (opts.couponIssueId) {
    const loaded = await loadCouponForMember(centerId, memberId, opts.couponIssueId, opts.excludeOrderId);
    if (loaded.error) {
      couponError = loaded.error;
    } else if (loaded.def) {
      const def = loaded.def;
      if (def.benefit_type === "gift") {
        // 증정 쿠폰 — 지정 상품이 담겨 있어야 하고 그 항목만 0원
        const idx = products.findIndex((p) => Number(p.id) === Number(def.gift_product_id));
        if (idx < 0) {
          couponError = `이 쿠폰은 '${def.gift_product_name || "지정 상품"}'을(를) 담아야 쓸 수 있어요`;
        } else {
          couponTargetIdx = [idx];
          couponDiscountWon = Math.max(0, Math.floor(products[idx].price_won || 0));
        }
      } else {
        // 적용 대상 유형의 항목들만 모아 합계 기준으로 계산
        const allowed = def.applicable_types;
        couponTargetIdx = products
          .map((p, i) => ({ p, i }))
          .filter(({ p }) => !allowed || allowed.length === 0 || allowed.includes(p.type))
          .map(({ i }) => i);
        if (couponTargetIdx.length === 0) {
          const labels = (allowed ?? []).map((t) => TYPE_LABEL[t] ?? t).join("·");
          couponError = `${labels} 상품에만 쓸 수 있는 쿠폰이에요`;
        } else {
          const targetSum = couponTargetIdx.reduce(
            (s, i) => s + Math.max(0, Math.floor(products[i].price_won || 0)),
            0
          );
          // 대상 항목이 모두 부가세 포함가일 때만 공급가 기준을 적용한다
          const allVatIncluded = couponTargetIdx.every((i) => products[i].vat_included !== false);
          const check = computeCouponDiscount(def, {
            priceWon: targetSum,
            productType: products[couponTargetIdx[0]].type,
            productId: products[couponTargetIdx[0]].id,
            vatIncluded: allVatIncluded,
          });
          if (!check.ok) couponError = check.reason ?? "적용할 수 없는 쿠폰이에요";
          else couponDiscountWon = check.discountWon;
        }
      }
      if (!couponError) {
        coupon = {
          issueId: opts.couponIssueId,
          name: def.name,
          benefit: benefitText(def),
          discountWon: couponDiscountWon,
          isGift: def.benefit_type === "gift",
        };
      }
    }
  }

  // 쿠폰 할인을 대상 항목에 비례 배분
  const perLineCoupon = products.map(() => 0);
  if (couponDiscountWon > 0 && couponTargetIdx.length > 0) {
    const weights = couponTargetIdx.map((i) => Math.max(0, Math.floor(products[i].price_won || 0)));
    const parts = allocate(couponDiscountWon, weights);
    couponTargetIdx.forEach((lineIdx, k) => {
      perLineCoupon[lineIdx] = parts[k];
    });
  }

  const afterCoupon = Math.max(0, listPriceWon - couponDiscountWon);

  /* ── 마일리지 ─────────────────────────────────────── */
  const mileageBalance = Math.max(0, Math.floor(mem?.mileage ?? 0));
  const mileageHeld = await heldMileage({ centerId, memberId, excludeOrderId: opts.excludeOrderId });
  const available = Math.max(0, mileageBalance - mileageHeld);
  // 마일리지 사용이 막힌 상품의 몫은 한도에서 뺀다
  const mileageEligible = products.reduce(
    (s, p, i) =>
      p.mileage_usable === false
        ? s
        : s + Math.max(0, Math.floor(p.price_won || 0) - perLineCoupon[i]),
    0
  );
  const mileageMax = Math.min(available, mileageEligible);
  const mileageUsedWon = Math.max(0, Math.min(Math.floor(opts.mileageUse || 0), mileageMax));

  const perLineMileage = products.map(() => 0);
  if (mileageUsedWon > 0) {
    const weights = products.map((p, i) =>
      p.mileage_usable === false ? 0 : Math.max(0, Math.floor(p.price_won || 0) - perLineCoupon[i])
    );
    const parts = allocate(mileageUsedWon, weights);
    parts.forEach((v, i) => (perLineMileage[i] = v));
  }

  /* ── 항목 확정 ────────────────────────────────────── */
  const lines: CartLine[] = products.map((p, i) => {
    const list = Math.max(0, Math.floor(p.price_won || 0));
    const amount = Math.max(0, list - perLineCoupon[i] - perLineMileage[i]);
    return {
      productId: p.id,
      name: p.name,
      type: p.type,
      typeLabel: TYPE_LABEL[p.type] ?? p.type,
      listPriceWon: list,
      couponDiscountWon: perLineCoupon[i],
      mileageUsedWon: perLineMileage[i],
      amountWon: amount,
      mileageEarn: Math.max(0, Math.floor(p.mileage_earn || 0)),
      couponTarget: couponTargetIdx.includes(i),
    };
  });

  return {
    ok: true,
    couponError,
    lines,
    listPriceWon,
    couponDiscountWon,
    mileageUsedWon,
    amountWon: Math.max(0, afterCoupon - mileageUsedWon),
    mileageEarn: lines.reduce((s, l) => s + l.mileageEarn, 0),
    mileageBalance,
    mileageHeld,
    mileageMax,
    coupon,
  };
}

/** 쿠폰 발급건을 읽고 지금 쓸 수 있는지까지 본다 */
async function loadCouponForMember(
  centerId: number,
  memberId: number,
  issueId: number,
  excludeOrderId?: number
): Promise<{ def?: CouponDef; error?: string }> {
  const { data: issueRow } = await supabase
    .from("crm_coupon_issues")
    .select("id, center_id, member_id, coupon_id, status, expires_at")
    .eq("id", issueId)
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
    return { error: "쿠폰을 찾을 수 없어요" };
  }
  const st = effectiveStatus(issue);
  if (st !== "issued") {
    return {
      error: st === "used" ? "이미 사용된 쿠폰이에요" : st === "revoked" ? "회수된 쿠폰이에요" : "기간이 지난 쿠폰이에요",
    };
  }
  const def = await loadCouponDef(issue.coupon_id);
  if (!def) return { error: "쿠폰 정보를 찾을 수 없어요" };

  const { data: taken } = await supabase
    .from("crm_orders")
    .select("id")
    .eq("coupon_issue_id", issue.id)
    .in("status", ["pending", "processing", "paid"])
    .limit(1);
  const t = (taken ?? [])[0] as { id: number } | undefined;
  if (t && t.id !== excludeOrderId) return { error: "결제 진행 중인 다른 주문에 쓰인 쿠폰이에요" };

  return { def };
}
