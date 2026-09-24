import { describe, it, expect } from "vitest";
import { computeCouponDiscount, type CouponDef } from "@/app/lib/crm-coupons";

const base: CouponDef = {
  id: 3, name: "재등록 10% 할인 쿠폰", benefit_type: "percent",
  amount_won: null, percent: 10, max_discount_won: null, min_purchase_won: 0,
  gift_product_id: null, applicable_types: ["membership"],
  valid_mode: "days", valid_days: 30, valid_until: null,
};

describe("정률 쿠폰 기준액", () => {
  it("공급가 기준: 부가세 포함 77,000 → 7,000원 할인", () => {
    const c = { ...base, vat_exclusive_base: true };
    expect(computeCouponDiscount(c, { priceWon: 77000, productType: "membership", vatIncluded: true }).discountWon).toBe(7000);
  });
  it("공급가 기준: 부가세 포함 66,000 → 6,000원 할인", () => {
    const c = { ...base, vat_exclusive_base: true };
    expect(computeCouponDiscount(c, { priceWon: 66000, productType: "membership", vatIncluded: true }).discountWon).toBe(6000);
  });
  it("정가 기준(기본): 77,000 → 7,700원 할인", () => {
    expect(computeCouponDiscount(base, { priceWon: 77000, productType: "membership", vatIncluded: true }).discountWon).toBe(7700);
  });
  it("부가세 미포함 상품이면 공급가 옵션이어도 정가 기준", () => {
    const c = { ...base, vat_exclusive_base: true };
    expect(computeCouponDiscount(c, { priceWon: 70000, productType: "membership", vatIncluded: false }).discountWon).toBe(7000);
  });
  it("최대 할인액 상한은 그대로 적용된다", () => {
    const c = { ...base, vat_exclusive_base: true, max_discount_won: 5000 };
    expect(computeCouponDiscount(c, { priceWon: 77000, productType: "membership", vatIncluded: true }).discountWon).toBe(5000);
  });
});
