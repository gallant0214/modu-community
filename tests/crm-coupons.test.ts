import { describe, expect, it } from "vitest";
import {
  benefitText,
  computeCouponDiscount,
  conditionText,
  effectiveStatus,
  generateCouponCode,
  type CouponDef,
} from "../app/lib/crm-coupons";

const base: CouponDef = {
  id: 1,
  name: "테스트",
  benefit_type: "amount",
  amount_won: 10000,
  percent: null,
  max_discount_won: null,
  min_purchase_won: 0,
  gift_product_id: null,
  applicable_types: null,
  valid_mode: "days",
  valid_days: 30,
  valid_until: null,
};

describe("쿠폰 할인 계산", () => {
  it("정액 할인은 그 금액만큼 깎는다", () => {
    expect(computeCouponDiscount(base, { priceWon: 100000 })).toEqual({ ok: true, discountWon: 10000 });
  });

  it("정액 할인은 결제 금액보다 크게 깎지 않는다", () => {
    expect(computeCouponDiscount({ ...base, amount_won: 50000 }, { priceWon: 30000 }).discountWon).toBe(30000);
  });

  it("최소 결제금액 미만이면 적용 불가", () => {
    const r = computeCouponDiscount({ ...base, min_purchase_won: 200000 }, { priceWon: 150000 });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("200,000원 이상");
  });

  it("정률 할인은 비율로 깎고 상한을 넘지 않는다", () => {
    const c = { ...base, benefit_type: "percent" as const, amount_won: null, percent: 10, max_discount_won: 20000 };
    expect(computeCouponDiscount(c, { priceWon: 150000 }).discountWon).toBe(15000);
    expect(computeCouponDiscount(c, { priceWon: 500000 }).discountWon).toBe(20000); // 상한
  });

  it("정률 할인 원 단위 이하는 버린다", () => {
    const c = { ...base, benefit_type: "percent" as const, amount_won: null, percent: 15 };
    expect(computeCouponDiscount(c, { priceWon: 33333 }).discountWon).toBe(4999);
  });

  it("상품 종류 제한 — 다른 종류엔 못 쓴다", () => {
    const c = { ...base, applicable_types: ["personal"] };
    expect(computeCouponDiscount(c, { priceWon: 100000, productType: "personal" }).ok).toBe(true);
    const r = computeCouponDiscount(c, { priceWon: 100000, productType: "membership" });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("개인 레슨");
  });

  it("증정 쿠폰은 지정 상품일 때만 정가 전액을 깎는다", () => {
    const c = { ...base, benefit_type: "gift" as const, amount_won: null, gift_product_id: 7, gift_product_name: "PT 1회" };
    expect(computeCouponDiscount(c, { priceWon: 70000, productId: 7 })).toEqual({ ok: true, discountWon: 70000 });
    const r = computeCouponDiscount(c, { priceWon: 70000, productId: 8 });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("PT 1회");
  });

  it("결제 금액이 0원이면 할인 쿠폰은 못 쓴다", () => {
    expect(computeCouponDiscount(base, { priceWon: 0 }).ok).toBe(false);
  });
});

describe("쿠폰 상태·표시", () => {
  it("만료일이 지난 보유 쿠폰은 '기간 만료'", () => {
    expect(effectiveStatus({ status: "issued", expires_at: "2000-01-01" })).toBe("expired");
    expect(effectiveStatus({ status: "issued", expires_at: "2999-01-01" })).toBe("issued");
    // 사용·회수는 만료일과 무관하게 그 상태 유지
    expect(effectiveStatus({ status: "used", expires_at: "2000-01-01" })).toBe("used");
    expect(effectiveStatus({ status: "revoked", expires_at: "2000-01-01" })).toBe("revoked");
  });

  it("혜택·조건 문구", () => {
    expect(benefitText(base)).toBe("10,000원 할인");
    expect(
      benefitText({ ...base, benefit_type: "percent", percent: 12.5, max_discount_won: 30000 })
    ).toBe("12.5% 할인 (최대 30,000원)");
    expect(conditionText({ ...base, min_purchase_won: 100000, applicable_types: ["membership", "apparel"] })).toBe(
      "100,000원 이상 결제 시 · 회원권·운동복 전용"
    );
  });

  it("쿠폰 코드는 XXXX-XXXX, 헷갈리는 글자(0 O 1 I L) 없음", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateCouponCode();
      expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(code).not.toMatch(/[01OIL]/);
    }
  });
});
