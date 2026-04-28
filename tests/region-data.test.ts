import { describe, it, expect } from "vitest";
import { REGION_GROUPS, getRegionName } from "@/app/lib/region-data";

describe("REGION_GROUPS", () => {
  it("17개 시/도", () => {
    expect(REGION_GROUPS.length).toBe(17);
  });

  it("각 그룹은 code/name/subRegions 보유", () => {
    for (const g of REGION_GROUPS) {
      expect(typeof g.code).toBe("string");
      expect(typeof g.name).toBe("string");
      expect(Array.isArray(g.subRegions)).toBe(true);
      expect(g.subRegions.length).toBeGreaterThan(0);
    }
  });

  it("모든 sub region code는 유니크", () => {
    const codes = REGION_GROUPS.flatMap((g) => g.subRegions.map((s) => s.code));
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("getRegionName", () => {
  it("코드로 이름 조회", () => {
    expect(getRegionName("DAEGU_SUSEONG")).toBe("수성구");
    expect(getRegionName("SEOUL_GANGNAM")).toBe("강남구");
  });

  it("매칭 안 되면 코드 그대로 반환", () => {
    expect(getRegionName("NONEXISTENT_CODE")).toBe("NONEXISTENT_CODE");
  });
});
