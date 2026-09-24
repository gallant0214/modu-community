import { describe, it, expect } from "vitest";

/** member-checkout.ts 의 allocate 와 같은 규칙 (DB 의존 없이 계산만 검증) */
function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map((v) => Math.floor(v));
  let rest = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (rest <= 0) break;
    out[i] += 1;
    rest -= 1;
  }
  return out;
}

describe("묶음 결제 금액 배분", () => {
  it("배분 합계는 언제나 총액과 정확히 같다 (1원도 새지 않는다)", () => {
    const cases: [number, number[]][] = [
      [10000, [77000, 30000]],
      [7000, [77000]],
      [1, [1, 1, 1]],
      [9999, [33333, 33333, 33334]],
      [12345, [10000, 20000, 30000, 7]],
    ];
    for (const [total, weights] of cases) {
      const parts = allocate(total, weights);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      expect(parts.every((p) => p >= 0)).toBe(true);
    }
  });

  it("가중치가 0인 항목에는 배분하지 않는다 (마일리지 사용 불가 상품)", () => {
    const parts = allocate(10000, [77000, 0]);
    expect(parts[1]).toBe(0);
    expect(parts[0]).toBe(10000);
  });

  it("총액이 0이면 전부 0", () => {
    expect(allocate(0, [1000, 2000])).toEqual([0, 0]);
  });

  it("회원권 77,000 + 운동복 30,000 에 마일리지 10,000 배분", () => {
    const parts = allocate(10000, [77000, 30000]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10000);
    // 비율대로 — 회원권 쪽이 더 많이 먹는다
    expect(parts[0]).toBeGreaterThan(parts[1]);
  });
});
