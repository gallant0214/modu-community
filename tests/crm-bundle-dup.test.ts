import { describe, it, expect } from "vitest";
import { findBundleDupWarnings, type DupCheckLine } from "@/app/lib/crm-bundle-dup";

// 2026-10-05 임현정 회원 사례 그대로: 바우처 묶음(락커·운동복 포함) + 락커·운동복 따로
const voucher: DupCheckLine = {
  type: "membership",
  name: "스포츠바우처 1개월",
  startDate: "2026-11-01",
  durationValue: 1,
  durationUnit: "month",
  components: [
    { type: "locker", name: "스포츠바우처1개월(락커)", billing_mode: "period", duration_value: 1, duration_unit: "month" },
    { type: "apparel", name: "스포츠바우처 1개월(운동복)", billing_mode: "period", duration_value: 1, duration_unit: "month" },
  ],
};
const line = (type: string, name: string, startDate: string): DupCheckLine => ({
  type, name, startDate, durationValue: 1, durationUnit: "month",
});

describe("findBundleDupWarnings", () => {
  it("묶음에 든 락커·운동복을 같은 기간에 또 담으면 2건 경고", () => {
    const w = findBundleDupWarnings([
      voucher,
      line("locker", "락커 1개월(재등록)", "2026-11-01"),
      line("apparel", "운동복 1개월", "2026-11-01"),
    ]);
    expect(w).toHaveLength(2);
    expect(w[0]).toContain("락커 1개월(재등록)");
    expect(w[1]).toContain("운동복 1개월");
    expect(w[0]).toContain("락커가 두 장");
    expect(w[1]).toContain("운동복이 두 장");
  });

  it("묶음만 있으면 경고 없음", () => {
    expect(findBundleDupWarnings([voucher])).toEqual([]);
  });

  it("기간이 안 겹치면(다음 달 연장) 경고 없음", () => {
    expect(findBundleDupWarnings([voucher, line("locker", "락커 1개월", "2026-12-01")])).toEqual([]);
  });

  it("하루라도 겹치면 경고", () => {
    expect(findBundleDupWarnings([voucher, line("locker", "락커 1개월", "2026-11-30")])).toHaveLength(1);
  });

  it("종류가 다르면(회원권만 따로) 경고 없음", () => {
    expect(findBundleDupWarnings([voucher, line("membership", "헬스 1개월", "2026-11-01")])).toEqual([]);
  });

  it("담는 순서가 반대(단독 먼저, 묶음 나중)여도 경고", () => {
    expect(findBundleDupWarnings([line("locker", "락커 1개월", "2026-11-01"), voucher])).toHaveLength(1);
  });
});
