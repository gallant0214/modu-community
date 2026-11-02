import { describe, it, expect } from "vitest";
import { safeReturnPath } from "@/app/lib/safe-return-to";

describe("safeReturnPath", () => {
  it("내부 경로는 그대로 통과한다", () => {
    expect(safeReturnPath("/crm/dashboard")).toBe("/crm/dashboard");
    expect(safeReturnPath("/billing?pg=portone")).toBe("/billing?pg=portone");
    expect(safeReturnPath("/shop/wqm5edhqsfst#plans")).toBe("/shop/wqm5edhqsfst#plans");
  });

  it("외부로 나가는 값은 전부 막는다", () => {
    for (const bad of [
      "//evil.com",
      "///evil.com",
      "/\\evil.com",
      "/\t/evil.com",
      "/\n/evil.com",
      "https://evil.com",
      "http://evil.com",
      "javascript:alert(1)",
      "evil.com",
      "",
      null,
      undefined,
    ]) {
      expect(safeReturnPath(bad)).toBeNull();
    }
  });
});
