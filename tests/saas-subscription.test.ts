import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  subscriptionEnforcedForUid,
  isSubscriptionLive,
  accessStateFor,
  saasSalesAllowedForUid,
} from "@/app/lib/saas-access-policy";
import { planExpiryOn, defaultPlan, nextExpiryOn } from "@/app/lib/saas-plans";
import { kstTodayYmd } from "@/app/lib/crm-coupons";

/**
 * 🚨 규칙을 테스트에 복사하지 않고 **실제 모듈을 그대로 불러** 검증한다.
 *    같은 규칙을 두 군데 두면 한쪽만 고쳐져 어긋난다(과거에 세 번 났던 사고).
 */

const ENV_KEYS = [
  "CRM_SUBSCRIPTION_ENFORCE_UIDS",
  "SAAS_SALES_ENABLED",
  "SAAS_SALES_UID_ALLOWLIST",
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

/** 오늘(KST)에서 n일 떨어진 날짜 */
function shiftDays(n: number): string {
  const d = new Date(`${kstTodayYmd()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

describe("구독 강제 대상 — 🚨 극성이 판매 허용목록과 반대다", () => {
  it("환경변수가 없으면 아무에게도 강제하지 않는다 (= 전원 무료)", () => {
    expect(subscriptionEnforcedForUid("uid-a")).toBe(false);
    expect(subscriptionEnforcedForUid("uid-b")).toBe(false);
  });

  it("빈 문자열·쉼표만 있어도 전원 무료 — 설정 실수로 사장님을 잠그지 않는다", () => {
    for (const bad of ["", "   ", ",", " , , "]) {
      process.env.CRM_SUBSCRIPTION_ENFORCE_UIDS = bad;
      expect(subscriptionEnforcedForUid("uid-a")).toBe(false);
    }
  });

  it("uid 를 적으면 그 사람만 강제되고 나머지는 그대로 통과한다", () => {
    process.env.CRM_SUBSCRIPTION_ENFORCE_UIDS = "review-uid";
    expect(subscriptionEnforcedForUid("review-uid")).toBe(true);
    expect(subscriptionEnforcedForUid("owner-uid")).toBe(false);
  });

  it("공백이 섞인 목록도 읽는다", () => {
    process.env.CRM_SUBSCRIPTION_ENFORCE_UIDS = " a , b ,, c ";
    expect(subscriptionEnforcedForUid("a")).toBe(true);
    expect(subscriptionEnforcedForUid("b")).toBe(true);
    expect(subscriptionEnforcedForUid("c")).toBe(true);
    expect(subscriptionEnforcedForUid("d")).toBe(false);
  });
});

describe("구독 유효 판정 — 만료일 당일까지 포함", () => {
  it("만료일이 오늘이면 아직 유효하다", () => {
    expect(isSubscriptionLive({ status: "active", expires_on: kstTodayYmd() })).toBe(true);
  });

  it("만료일이 어제면 만료다", () => {
    expect(isSubscriptionLive({ status: "active", expires_on: shiftDays(-1) })).toBe(false);
  });

  it("canceled · expired 는 날짜가 남아 있어도 무효다", () => {
    expect(isSubscriptionLive({ status: "canceled", expires_on: shiftDays(30) })).toBe(false);
    expect(isSubscriptionLive({ status: "expired", expires_on: shiftDays(30) })).toBe(false);
  });

  it("구독이 없으면 무효다", () => {
    expect(isSubscriptionLive(null)).toBe(false);
  });
});

describe("접근 판정", () => {
  it("강제 대상이 아니면 구독이 없어도 통과한다", () => {
    const s = accessStateFor("free-uid", null);
    expect(s.allowed).toBe(true);
    expect(s.reason).toBe("not_enforced");
  });

  it("강제 대상인데 구독이 없으면 막고 이유를 알려준다", () => {
    process.env.CRM_SUBSCRIPTION_ENFORCE_UIDS = "review-uid";
    const s = accessStateFor("review-uid", null);
    expect(s.allowed).toBe(false);
    expect(s.reason).toBe("no_subscription");
  });

  it("강제 대상이고 구독이 만료됐으면 만료일과 함께 막는다", () => {
    process.env.CRM_SUBSCRIPTION_ENFORCE_UIDS = "review-uid";
    const yesterday = shiftDays(-1);
    const s = accessStateFor("review-uid", { status: "active", expires_on: yesterday });
    expect(s.allowed).toBe(false);
    expect(s.reason).toBe("expired");
    expect(s.expiresOn).toBe(yesterday);
  });

  it("강제 대상이고 구독이 살아 있으면 통과한다", () => {
    process.env.CRM_SUBSCRIPTION_ENFORCE_UIDS = "review-uid";
    const s = accessStateFor("review-uid", { status: "active", expires_on: shiftDays(10) });
    expect(s.allowed).toBe(true);
    expect(s.reason).toBe("ok");
  });
});

describe("판매 스위치 — 🚨 이쪽은 fail-closed", () => {
  it("스위치가 꺼져 있으면 아무도 결제할 수 없다", () => {
    expect(saasSalesAllowedForUid("uid-a")).toBe(false);
  });

  it("스위치만 켜면 전원 허용", () => {
    process.env.SAAS_SALES_ENABLED = "1";
    expect(saasSalesAllowedForUid("uid-a")).toBe(true);
  });

  it("허용목록을 적으면 그 사람만 결제 가능", () => {
    process.env.SAAS_SALES_ENABLED = "1";
    process.env.SAAS_SALES_UID_ALLOWLIST = "review-uid";
    expect(saasSalesAllowedForUid("review-uid")).toBe(true);
    expect(saasSalesAllowedForUid("other-uid")).toBe(false);
  });

  it("값이 있는데 쓸 수 있는 uid 가 없으면 전원 차단 (설정 실수가 '전원 허용'으로 풀리지 않는다)", () => {
    process.env.SAAS_SALES_ENABLED = "1";
    process.env.SAAS_SALES_UID_ALLOWLIST = ",, ,";
    expect(saasSalesAllowedForUid("review-uid")).toBe(false);
  });
});

describe("구독 만료일 계산 — 달력 기준, 1개월은 30일이 아니다", () => {
  it("1개월 = 시작일 + 1개월 - 1일", () => {
    expect(planExpiryOn("2026-10-08", 1)).toBe("2026-11-07");
    expect(planExpiryOn("2026-01-15", 1)).toBe("2026-02-14");
  });

  it("28일보다 짧은 달로 넘어가면 말일로 클램프한다", () => {
    // 1/31 + 1개월 → 2/28 로 클램프된 뒤 -1일
    expect(planExpiryOn("2026-01-31", 1)).toBe("2026-02-27");
  });

  it("2월 말에서 시작해도 날짜가 깨지지 않는다", () => {
    expect(planExpiryOn("2026-02-28", 1)).toBe("2026-03-27");
  });

  it("기본 요금제는 1개월 99,000원이다 (심사에 올린 상품과 일치해야 한다)", () => {
    const plan = defaultPlan();
    expect(plan.periodMonths).toBe(1);
    expect(plan.priceWon).toBe(99000);
  });
});

describe("구독 이어붙이기 — 미리 결제해도 남은 기간을 잃지 않는다", () => {
  /** 🚨 규칙을 복사하지 않는다 — completeSaasOrder 가 쓰는 함수를 그대로 부른다 */
  const nextExpiry = (currentExpiresOn: string | null, months: number) =>
    nextExpiryOn({ currentExpiresOn, periodMonths: months, todayYmd: kstTodayYmd() }).expiresOn;

  it("유효한 구독이 남아 있으면 기존 만료일 다음 날부터 1개월이 더해진다", () => {
    const in10 = shiftDays(10);
    const got = nextExpiry(in10, 1);
    // 기존 만료일보다 뒤여야 한다 — 남은 10일이 사라지면 안 된다
    expect(got > in10).toBe(true);
  });

  it("이미 만료됐으면 오늘부터 새로 1개월", () => {
    expect(nextExpiry(shiftDays(-5), 1)).toBe(planExpiryOn(kstTodayYmd(), 1));
  });

  it("구독이 없으면 오늘부터 1개월", () => {
    expect(nextExpiry(null, 1)).toBe(planExpiryOn(kstTodayYmd(), 1));
  });

  it("이어붙임 여부를 알려준다 — 시작일이 기존 만료 '다음 날' 이어야 한다", () => {
    const in10 = shiftDays(10);
    const p = nextExpiryOn({ currentExpiresOn: in10, periodMonths: 1, todayYmd: kstTodayYmd() });
    expect(p.chained).toBe(true);
    expect(p.startOn).toBe(shiftDays(11));

    const past = nextExpiryOn({ currentExpiresOn: shiftDays(-1), periodMonths: 1, todayYmd: kstTodayYmd() });
    expect(past.chained).toBe(false);
    expect(past.startOn).toBe(kstTodayYmd());
  });
});
