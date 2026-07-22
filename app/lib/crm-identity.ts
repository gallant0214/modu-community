import { createHash } from "node:crypto";

/** 문자열에서 숫자만 추출 */
export function digitsOnly(s: string | null | undefined): string {
  return (s || "").replace(/[^0-9]/g, "");
}

/**
 * 주민등록번호(13자리) → SHA-256 해시(hex). 평문 저장 대신 해시만 보관·비교.
 * 형식이 13자리가 아니면 null.
 */
export function residentHash(raw: string | null | undefined): string | null {
  const d = digitsOnly(raw);
  if (d.length !== 13) return null;
  return createHash("sha256").update(d).digest("hex");
}

/** 주민번호 앞 6자리(생년월일 YYMMDD) 추출. 아니면 null */
export function residentBirth(raw: string | null | undefined): string | null {
  const d = digitsOnly(raw);
  return d.length >= 6 ? d.slice(0, 6) : null;
}
