/**
 * CRM 쿠폰 공용 로직 — 화면(발급창·쿠폰 탭)과 서버(발급 라우트·쿠폰 API)가 같은 규칙을 쓴다.
 *
 * 혜택 3종
 *   amount  정액 할인  (최소 결제금액 조건)
 *   percent 정률 할인  (최대 할인액 상한, 최소 결제금액 조건)
 *   gift    상품 증정  (지정 상품을 0원으로 발급 — 발급창에서 그 상품을 골라야 적용)
 *
 * 상태: issued(보유) / used(사용) / revoked(회수). '만료'는 저장하지 않고 expires_at 으로 계산.
 */

export type BenefitType = "amount" | "percent" | "gift";
export type IssueStatus = "issued" | "used" | "revoked" | "expired";

export interface CouponDef {
  id: number;
  name: string;
  benefit_type: BenefitType;
  amount_won: number | null;
  percent: number | null;
  max_discount_won: number | null;
  min_purchase_won: number;
  gift_product_id: number | null;
  applicable_types: string[] | null;
  valid_mode: "days" | "until";
  valid_days: number | null;
  valid_until: string | null;
  one_per_member?: boolean;
  /**
   * 정률 할인을 **공급가액(부가세 제외)** 기준으로 계산할지.
   * 헬스 회원권처럼 "부가세를 받지 않는" 운영을 쿠폰으로 표현할 때 쓴다.
   * 77,000(부가세 포함)의 10% → 정가 기준 7,700 / 공급가 기준 7,000
   */
  vat_exclusive_base?: boolean;
  status?: string;
  /** 증정 상품 이름(조인해서 채움) */
  gift_product_name?: string | null;
}

/** 상품 유형 표시명 — crm_products.type 기준 */
export const PRODUCT_TYPE_LABEL: Record<string, string> = {
  membership: "회원권",
  personal: "개인 레슨",
  group: "그룹 레슨",
  class: "클래스",
  apparel: "운동복",
  locker: "락커",
  goods: "물품",
};

export const BENEFIT_LABEL: Record<BenefitType, string> = {
  amount: "정액 할인",
  percent: "정률 할인",
  gift: "상품 증정",
};

export const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = {
  issued: "사용 가능",
  used: "사용 완료",
  revoked: "회수됨",
  expired: "기간 만료",
};

const won = (n: number) => `${Math.round(n).toLocaleString()}원`;

/** "10,000원 할인" / "10% 할인 (최대 20,000원)" / "PT 1회 증정" */
export function benefitText(c: CouponDef): string {
  if (c.benefit_type === "amount") return `${won(c.amount_won ?? 0)} 할인`;
  if (c.benefit_type === "percent") {
    const p = Number(c.percent ?? 0);
    const pct = Number.isInteger(p) ? String(p) : p.toFixed(1);
    const base = c.vat_exclusive_base ? " (부가세 제외 금액 기준)" : "";
    return `${pct}% 할인${c.max_discount_won ? ` (최대 ${won(c.max_discount_won)})` : ""}${base}`;
  }
  return `${c.gift_product_name || "지정 상품"} 증정`;
}

/** 사용 조건 한 줄 요약 */
export function conditionText(c: CouponDef): string {
  const parts: string[] = [];
  if (c.min_purchase_won > 0) parts.push(`${won(c.min_purchase_won)} 이상 결제 시`);
  if (c.applicable_types && c.applicable_types.length > 0) {
    parts.push(c.applicable_types.map((t) => PRODUCT_TYPE_LABEL[t] ?? t).join("·") + " 전용");
  }
  return parts.join(" · ");
}

/** KST 오늘 YYYY-MM-DD */
export function kstTodayYmd(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 발급 시점 기준 만료일 */
export function issueExpiryYmd(c: Pick<CouponDef, "valid_mode" | "valid_days" | "valid_until">): string | null {
  if (c.valid_mode === "until") return c.valid_until ?? null;
  const days = Math.max(1, Math.floor(c.valid_days ?? 30));
  const d = new Date(`${kstTodayYmd()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days - 1); // 발급일 포함 N일
  return d.toISOString().slice(0, 10);
}

/** 저장된 상태 + 만료일로 실제 상태 판정 */
export function effectiveStatus(issue: { status: string; expires_at: string | null }): IssueStatus {
  if (issue.status === "used") return "used";
  if (issue.status === "revoked") return "revoked";
  if (issue.expires_at && issue.expires_at < kstTodayYmd()) return "expired";
  return "issued";
}

export interface DiscountCheck {
  ok: boolean;
  /** 이 쿠폰으로 깎이는 금액(원) */
  discountWon: number;
  /** 적용 불가 사유 (ok=false 일 때) */
  reason?: string;
}

/** 부가세 포함가 → 공급가액 (10% 기준, 원 단위 반올림) */
export function supplyAmount(priceWon: number): number {
  return Math.round(priceWon / 1.1);
}

/**
 * 쿠폰을 특정 상품 결제에 적용했을 때의 할인액.
 * @param priceWon     쿠폰 적용 전 정가
 * @param productType  crm_products.type (membership/personal/…)
 * @param productId    선택된 상품 id (증정 쿠폰 판정용)
 * @param vatIncluded  상품 가격이 부가세 포함가인지 (crm_products.vat_included)
 */
export function computeCouponDiscount(
  c: CouponDef,
  target: {
    priceWon: number;
    productType?: string | null;
    productId?: number | null;
    vatIncluded?: boolean;
  }
): DiscountCheck {
  const price = Math.max(0, Math.floor(target.priceWon || 0));

  if (c.benefit_type === "gift") {
    if (!c.gift_product_id) return { ok: false, discountWon: 0, reason: "증정 상품이 지정되지 않은 쿠폰이에요" };
    if (!target.productId || Number(target.productId) !== Number(c.gift_product_id)) {
      return {
        ok: false,
        discountWon: 0,
        reason: `이 쿠폰은 '${c.gift_product_name || "지정 상품"}'을(를) 선택해야 쓸 수 있어요`,
      };
    }
    return { ok: true, discountWon: price };
  }

  if (c.applicable_types && c.applicable_types.length > 0) {
    if (!target.productType || !c.applicable_types.includes(target.productType)) {
      const allowed = c.applicable_types.map((t) => PRODUCT_TYPE_LABEL[t] ?? t).join("·");
      return { ok: false, discountWon: 0, reason: `${allowed} 상품에만 쓸 수 있는 쿠폰이에요` };
    }
  }
  if (price <= 0) return { ok: false, discountWon: 0, reason: "결제 금액이 없어요" };
  if (c.min_purchase_won > 0 && price < c.min_purchase_won) {
    return { ok: false, discountWon: 0, reason: `${won(c.min_purchase_won)} 이상 결제 시 쓸 수 있어요` };
  }

  let discount = 0;
  if (c.benefit_type === "amount") {
    discount = Math.floor(c.amount_won ?? 0);
  } else {
    /* 정률 할인 기준액.
       vat_exclusive_base 면 공급가액(부가세 제외)에 퍼센트를 매긴다.
       부가세 포함가가 아닌 상품(vat_included=false)은 이미 공급가이므로 그대로 쓴다. */
    const base =
      c.vat_exclusive_base && target.vatIncluded !== false ? supplyAmount(price) : price;
    discount = Math.floor((base * Number(c.percent ?? 0)) / 100);
    if (c.max_discount_won) discount = Math.min(discount, Math.floor(c.max_discount_won));
  }
  discount = Math.max(0, Math.min(discount, price)); // 결제 금액보다 크게 깎지 않는다
  if (discount <= 0) return { ok: false, discountWon: 0, reason: "할인 금액이 0원이에요" };
  return { ok: true, discountWon: discount };
}

/** 쿠폰 코드 — 헷갈리는 글자(0/O/1/I/L) 제외 8자리 */
export function generateCouponCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

/** 기본 안내 문구 (발송 화면 미리보기와 같은 규칙) */
export function defaultCouponMessage(opts: {
  centerName: string;
  couponName: string;
  benefit: string;
  condition: string;
  expiresAt: string | null;
}): string {
  const lines = [
    `[${opts.centerName}] '${opts.couponName}' 쿠폰이 도착했어요 🎁`,
    `혜택: ${opts.benefit}${opts.condition ? ` (${opts.condition})` : ""}`,
  ];
  if (opts.expiresAt) lines.push(`사용 기한: ${opts.expiresAt.replace(/-/g, ".")}까지`);
  lines.push("결제하실 때 직원에게 쿠폰 사용을 말씀해 주세요.");
  return lines.join("\n");
}

