import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  apiKeyDisplayPrefix,
  csvCell,
  extractApiKey,
  isApiKeyFormat,
  toCsv,
} from "../app/lib/crm-api-keys";
import { generateApiKey, hashApiKey } from "../app/lib/crm-api-key-auth";

const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });
const KEY = "mcm_" + "A".repeat(16) + "b".repeat(8) + "9".repeat(8);

describe("API 키 발급", () => {
  it("mcm_ + 영문·숫자 32자, 매번 다르다", () => {
    const keys = new Set(Array.from({ length: 200 }, () => generateApiKey()));
    expect(keys.size).toBe(200);
    for (const k of keys) expect(isApiKeyFormat(k)).toBe(true);
  });
  it("저장은 SHA-256 hex — 같은 키는 같은 값, 원문과 다르다", () => {
    expect(hashApiKey(KEY)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiKey(KEY)).toBe(hashApiKey(KEY));
    expect(hashApiKey(KEY)).not.toBe(hashApiKey(KEY + "x"));
  });
  it("목록 표시용 앞부분은 접두어 + 8자뿐", () => {
    expect(apiKeyDisplayPrefix(KEY)).toBe("mcm_AAAAAAAA");
  });
  it("형식이 다르면 거부", () => {
    expect(isApiKeyFormat("mcm_short")).toBe(false);
    expect(isApiKeyFormat(KEY + "A")).toBe(false);
    expect(isApiKeyFormat(KEY.replace("mcm_", "abc_"))).toBe(false);
    expect(isApiKeyFormat(KEY.slice(0, -1) + "-")).toBe(false);
  });
});

describe("요청에서 키 꺼내기", () => {
  const url = "https://moducm.com/api/open/v1/members";
  it("Authorization: Bearer 가 먼저", () => {
    expect(extractApiKey(headers({ authorization: `Bearer ${KEY}`, "x-api-key": "other" }), `${url}?key=q`)).toBe(KEY);
  });
  it("mcm_ 가 아닌 Bearer(로그인 토큰)는 건너뛰고 다음 방법을 본다", () => {
    expect(extractApiKey(headers({ authorization: "Bearer eyJhbGci.firebase" }), `${url}?key=${KEY}`)).toBe(KEY);
  });
  it("X-API-Key 헤더, 그다음 ?key= 쿼리", () => {
    expect(extractApiKey(headers({ "x-api-key": KEY }), url)).toBe(KEY);
    expect(extractApiKey(headers({}), `${url}?format=csv&key=${KEY}`)).toBe(KEY);
  });
  it("아무것도 없으면 null", () => {
    expect(extractApiKey(headers({}), url)).toBeNull();
  });
});

describe("CSV", () => {
  it("숫자는 그대로, 글자는 따옴표, 따옴표는 두 번", () => {
    expect(csvCell(150000)).toBe("150000");
    expect(csvCell(-33000)).toBe("-33000");
    expect(csvCell('PT "20회"')).toBe('"PT ""20회"""');
    expect(csvCell(null)).toBe("");
    expect(csvCell(true)).toBe("Y");
  });
  it("수식으로 실행될 글자는 앞에 ' 를 붙인다", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+82")).toBe("\"'+82\"");
    expect(csvCell("@sum")).toBe("\"'@sum\"");
    expect(csvCell("-cmd")).toBe("\"'-cmd\"");
    expect(csvCell("-5000")).toBe('"-5000"'); // 글자로 온 음수는 그대로
  });
  it("한글 머리글 + BOM + 줄바꿈 CRLF", () => {
    const csv = toCsv([{ key: "a", label: "이름" }, { key: "b", label: "금액" }], [{ a: "홍길동", b: 1000 }]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1)).toBe('"이름","금액"\r\n"홍길동",1000');
  });
});
