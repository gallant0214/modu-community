/**
 * 붙여넣은 명단(이름·날짜·금액 등이 섞인 원문)에서 전화번호만 뽑는다. 중복 제거·입력 순서 유지.
 * 문자 전송 '직접 입력'과 쿠폰 발송 '전화번호로 입력'이 같이 쓴다 — 한쪽만 고쳐지지 않게 여기 한 곳.
 *
 * 1) 휴대폰(010·011·016~019)은 모양이 달라도 찾아서 0으로 시작하는 번호로 맞춘다
 *    - 하이픈·점·띄어쓰기·괄호: 010-1234-5678 / 010.1234.5678 / 010 1234 5678 / (010)1234-5678
 *    - 엑셀이 앞자리 0을 지운 숫자: 1012345678 → 01012345678 (10으로 시작하는 10자리만 — 다른 숫자 오인 방지)
 *    - 국가번호: +82 10-1234-5678 / 821012345678 → 01012345678
 * 2) 그 밖의 번호(유선 053-755-4455 등)는 공백·쉼표·세미콜론으로 나눈 조각 중 0으로 시작하는 숫자 9~11자리
 *    (국내 전화번호는 모두 0으로 시작 — 금액·사업자번호·회원번호를 번호로 잘못 잡지 않게)
 */
const MOBILE_RE = /(?<!\d)(\+?82[\s.)-]*)?(\(?0)?(1[016789])\)?[\s.-]*(\d{3,4})[\s.-]*(\d{4})(?!\d)/g;

export function parsePhoneList(raw: string): string[] {
  const text = raw ?? "";
  const found: { at: number; phone: string }[] = [];

  // 1) 휴대폰 — 찾은 자리는 지워서 2) 에서 다시 잡히지 않게
  let rest = text;
  for (const m of text.matchAll(MOBILE_RE)) {
    const [whole, country, zero, prefix, mid, last] = m;
    // 0·국가번호 없이 시작하면 '10' + 8자리(엑셀이 0을 지운 010 번호)만 인정
    if (!country && !zero && !(prefix === "10" && mid.length === 4)) continue;
    const at = m.index ?? 0;
    found.push({ at, phone: `0${prefix}${mid}${last}` });
    rest = rest.slice(0, at) + " ".repeat(whole.length) + rest.slice(at + whole.length);
  }

  // 2) 나머지 번호
  for (const m of rest.matchAll(/[^\s,;]+/g)) {
    const d = m[0].replace(/\D/g, "");
    if (d.length >= 9 && d.length <= 11 && d.startsWith("0")) found.push({ at: m.index ?? 0, phone: d });
  }

  found.sort((a, b) => a.at - b.at);
  return Array.from(new Set(found.map((f) => f.phone)));
}
