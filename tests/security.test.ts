import { describe, it, expect } from "vitest";
import { sanitize, sanitizeObject, validateLength } from "@/app/lib/security";

describe("sanitize (XSS 방어)", () => {
  it("HTML 태그 escape", () => {
    expect(sanitize("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });

  it("따옴표/홑따옴표 escape", () => {
    expect(sanitize(`"hello" 'world'`)).toBe(
      "&quot;hello&quot; &#x27;world&#x27;",
    );
  });

  it("일반 텍스트는 그대로", () => {
    expect(sanitize("안녕하세요 모듀!")).toBe("안녕하세요 모듀!");
  });

  it("빈 문자열", () => {
    expect(sanitize("")).toBe("");
  });
});

describe("sanitizeObject", () => {
  it("문자열 필드만 sanitize, 다른 타입은 보존", () => {
    const obj = {
      title: "<b>hi</b>",
      count: 5,
      active: true,
      tags: null,
    };
    const result = sanitizeObject(obj);
    expect(result.title).toBe("&lt;b&gt;hi&lt;/b&gt;");
    expect(result.count).toBe(5);
    expect(result.active).toBe(true);
    expect(result.tags).toBe(null);
  });
});

describe("validateLength", () => {
  it("길이 제한 미만은 그대로", () => {
    expect(validateLength("hello", 10)).toBe("hello");
  });

  it("길이 제한 초과 시 자름", () => {
    expect(validateLength("hello world", 5)).toBe("hello");
  });

  it("null/undefined는 빈 문자열", () => {
    expect(validateLength(null, 10)).toBe("");
    expect(validateLength(undefined, 10)).toBe("");
  });
});
