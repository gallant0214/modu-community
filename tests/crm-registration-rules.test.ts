import { describe, expect, it } from "vitest";
import {
  isFreeServiceMembership,
  isFreeServicePass,
  isPaidRenewalMembership,
  isRenewalPlanName,
} from "@/app/lib/crm-registration-rules";

const FREE = new Set(["지인소개 이벤트 (신규회원)", "신규 리뷰작성 (1주)"]);

describe("isFreeServiceMembership", () => {
  it("0원 리뷰·연장·체험·서비스는 무료 서비스", () => {
    expect(isFreeServiceMembership("신규 리뷰작성 (1주)", 0)).toBe(true);
    expect(isFreeServiceMembership("리뷰이벤트 2주 연장", 0)).toBe(true);
    expect(isFreeServiceMembership("네이버 일주일 연장쿠폰", 0)).toBe(true);
    expect(isFreeServiceMembership("당근 체험권", 0)).toBe(true);
    expect(isFreeServiceMembership("헬스 서비스 3개월 [3개월]", 0)).toBe(true);
    expect(isFreeServiceMembership("재등록 리뷰작성 10일", 0)).toBe(true);
  });
  it("키워드가 없어도 센터의 0원 상품이면 무료", () => {
    expect(isFreeServiceMembership("지인소개 이벤트 (신규회원)", 0, FREE)).toBe(true);
  });
  it("돈을 받았으면 이름과 관계없이 유료", () => {
    expect(isFreeServiceMembership("신규 리뷰작성 (1주)", 10000)).toBe(false);
  });
  it("0원이어도 일반 상품명·쿠폰제는 유료 등록으로 본다 (이관 금액 누락 대비)", () => {
    expect(isFreeServiceMembership("3개월(재등록)", 0)).toBe(false);
    expect(isFreeServiceMembership("40일 이용권 (PT-10회)", 0)).toBe(false);
    expect(isFreeServiceMembership("10회 쿠폰제", 0)).toBe(false);
  });
});

describe("isFreeServicePass", () => {
  it("서비스 세션 분리 발급은 무료", () => {
    expect(isFreeServicePass("service", "대표 10회", 0)).toBe(true);
  });
  it("0원 서비스·체험·OT 수강권은 무료", () => {
    expect(isFreeServicePass("new", "서비스 1회", 0)).toBe(true);
    expect(isFreeServicePass("new", "O.T", 0)).toBe(true);
  });
  it("유료 PT·유료 체험PT는 등록", () => {
    expect(isFreeServicePass("new", "대표 10회", 660000)).toBe(false);
    expect(isFreeServicePass("new", "체험PT 2회", 20000)).toBe(false);
  });
});

describe("재등록 상품", () => {
  it("이름에 재등록이 붙으면 재등록 상품", () => {
    expect(isRenewalPlanName("3개월(재등록)")).toBe(true);
    expect(isRenewalPlanName("성인재등록 6개월 [6개월]")).toBe(true);
    expect(isRenewalPlanName("2개월 (신규)")).toBe(false);
  });
  it("유료 재등록 회원권만 재등록 판정 — 무료 리뷰·환불 건 제외", () => {
    expect(isPaidRenewalMembership({ plan_name: "3개월(재등록)", price_won: 165000, status: "valid" })).toBe(true);
    expect(isPaidRenewalMembership({ plan_name: "3개월(재등록)", price_won: 0, status: "expired" })).toBe(true);
    expect(isPaidRenewalMembership({ plan_name: "재등록 리뷰작성 10일", price_won: 0, status: "valid" })).toBe(false);
    expect(isPaidRenewalMembership({ plan_name: "3개월(재등록)", price_won: 165000, status: "refunded" })).toBe(false);
  });
});
