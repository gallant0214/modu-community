import crypto from "node:crypto";

/**
 * 센터 공개 판매 페이지 주소(/shop/[slug])에 쓰는 랜덤 코드.
 *
 * 헷갈리는 글자(0 o 1 l i)를 뺀 30자 알파벳에서 12자 → 약 5.3×10^17 조합.
 * 순번(/shop/1)처럼 옆 센터를 찍어볼 수 없게 하는 게 목적이다.
 * 비밀값은 아니다 — 상품·가격은 공개 정보고, 구매는 로그인해야 된다.
 */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const LENGTH = 12;

export function generateShopSlug(): string {
  const bytes = crypto.randomBytes(LENGTH * 2);
  let out = "";
  for (let i = 0; out.length < LENGTH && i < bytes.length; i++) {
    // 알파벳 길이로 나눈 나머지 편향을 없애려 경계 초과 값은 버린다
    const max = 256 - (256 % ALPHABET.length);
    if (bytes[i] >= max) continue;
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  // 극히 드물게 모자라면 재귀로 다시 (사실상 발생하지 않음)
  return out.length === LENGTH ? out : generateShopSlug();
}

/** 주소에 들어온 값이 우리가 발급한 형식인지 — DB 조회 전에 걸러낸다 */
export function isValidShopSlug(v: string | null | undefined): boolean {
  if (!v) return false;
  return new RegExp(`^[${ALPHABET}]{${LENGTH}}$`).test(v);
}
