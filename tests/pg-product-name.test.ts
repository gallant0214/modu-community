import { describe, it, expect } from "vitest";
import { pgProductName, typeCode } from "@/app/lib/pg-product-name";

/**
 * 이니시스 전표에 '회원권·운동복·락커' 가 남지 않아야 한다(2026-10-29 심사 지적).
 * 이 테스트가 지키는 약속은 하나다 — PG 로 나가는 문자열에 한글 종목명이 없다.
 */
describe("pgProductName", () => {
  it("종목을 코드로 바꾼다", () => {
    expect(typeCode("membership")).toBe("H");
    expect(typeCode("apparel")).toBe("W");
    expect(typeCode("locker")).toBe("L");
  });

  it("매핑에 없는 종목은 한글로 흘리지 않고 E 로 묶는다", () => {
    for (const t of ["personal", "group", "class", "goods", "", null, undefined]) {
      expect(typeCode(t)).toBe("E");
    }
  });

  it("단품은 코드 + 기간", () => {
    expect(
      pgProductName({ types: ["membership"], durationValue: 3, durationUnit: "month" })
    ).toBe("H 3개월");
    expect(pgProductName({ types: ["apparel"], durationValue: 7, durationUnit: "day" })).toBe(
      "W 7일"
    );
  });

  it("묶음은 코드를 이어 붙이고, 담긴 순서와 무관하게 같은 문자열이 나온다", () => {
    const a = pgProductName({
      types: ["membership", "apparel"],
      durationValue: 3,
      durationUnit: "month",
    });
    const b = pgProductName({
      types: ["apparel", "membership"],
      durationValue: 3,
      durationUnit: "month",
    });
    expect(a).toBe("H+W 3개월");
    expect(b).toBe(a);
    expect(
      pgProductName({ types: ["locker", "apparel", "membership"], durationValue: 1, durationUnit: "month" })
    ).toBe("H+W+L 1개월");
  });

  it("같은 종목이 여러 건이어도 코드는 한 번만 쓴다", () => {
    expect(
      pgProductName({ types: ["membership", "membership"], durationValue: 6, durationUnit: "month" })
    ).toBe("H 6개월");
  });

  it("기간이 없는 회차형은 횟수를 쓴다", () => {
    expect(
      pgProductName({ types: ["membership"], durationValue: 0, durationUnit: "month", totalSessions: 20 })
    ).toBe("H 20회");
  });

  it("기간도 횟수도 없으면 코드만 남는다", () => {
    expect(pgProductName({ types: ["membership"] })).toBe("H");
    expect(pgProductName({ types: [] })).toBe("E");
  });

  it("어떤 입력에도 한글 종목명이 섞이지 않는다", () => {
    const inputs = [
      { types: ["membership"], durationValue: 3, durationUnit: "month" },
      { types: ["apparel", "locker"], durationValue: 40, durationUnit: "day" },
      { types: ["personal"], totalSessions: 10 },
      { types: ["goods"] },
    ];
    for (const i of inputs) {
      const out = pgProductName(i);
      for (const word of ["회원권", "운동복", "락커", "레슨", "클래스", "물품"]) {
        expect(out).not.toContain(word);
      }
    }
  });
});
