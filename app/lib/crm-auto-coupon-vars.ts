/**
 * 자동 메세지 **쿠폰 변수 치환** — 순수 문자열 처리만 모아 둔 모듈.
 *
 * 🚨 발송 서버(crm-auto-coupon.ts)와 설정 화면 미리보기가 **같은 함수**를 쓰게 하려고
 *   DB 접근이 있는 모듈에서 떼어냈다. 화면에서 따로 구현하면 미리보기와 실제 발송 문구가
 *   어긋난다(예전에 미리보기 전용 previewWithCoupon 이 따로 있었다).
 *   이 파일은 client 컴포넌트에서도 import 할 수 있어야 하므로 supabase 등을 들이지 않는다.
 */

/** 본문에 넣을 수 있는 쿠폰 변수 */
export const COUPON_VARIABLES = ["#쿠폰명#", "#쿠폰혜택#", "#쿠폰코드#", "#쿠폰기한#"] as const;

export interface CouponVars {
  name: string;
  benefit: string;
  code: string;
  expires: string; // "2026.10.19까지" 또는 "기한 없음"
}

/** 쿠폰 사용 기한 표기 */
export function fmtExpiry(ymd: string | null): string {
  return ymd ? `${ymd.replace(/-/g, ".")}까지` : "기한 없음";
}

/** 쿠폰 변수 치환. 본문에 쿠폰 변수가 하나도 없으면 끝에 안내 블록을 자동으로 붙인다. */
export function applyCouponVars(message: string, v: CouponVars): string {
  const hasVar = COUPON_VARIABLES.some((k) => message.includes(k));
  const replaced = message
    .replaceAll("#쿠폰명#", v.name)
    .replaceAll("#쿠폰혜택#", v.benefit)
    .replaceAll("#쿠폰코드#", v.code)
    .replaceAll("#쿠폰기한#", v.expires);
  if (hasVar) return replaced;
  return `${replaced.trimEnd()}\n\n🎫 쿠폰이 발급됐어요\n${v.name} (${v.benefit})\n쿠폰코드 ${v.code} · ${v.expires}`;
}

/**
 * 쿠폰 변수만 바꾼다(안내 블록을 덧붙이지 않음) — 회원이 이미 가진 쿠폰을 안내할 때(쿠폰 만료 알림).
 */
export function fillCouponVars(message: string, v: CouponVars): string {
  return message
    .replaceAll("#쿠폰명#", v.name)
    .replaceAll("#쿠폰혜택#", v.benefit)
    .replaceAll("#쿠폰코드#", v.code)
    .replaceAll("#쿠폰기한#", v.expires);
}

/**
 * 쿠폰이 안 붙었을 때 본문에 남은 쿠폰 변수를 지운다.
 * 🚨 예전엔 쿠폰이 없으면(06 미설정·규칙 쿠폰 사용 등) `#쿠폰혜택#` 같은 글자가 그대로 발송됐다.
 *    변수를 지우고 그 변수만 있던 줄·여분 공백도 정리한다.
 */
export function stripCouponVars(message: string): string {
  if (!COUPON_VARIABLES.some((k) => message.includes(k))) return message;
  const out: string[] = [];
  for (const raw of message.split("\n")) {
    const had = COUPON_VARIABLES.some((k) => raw.includes(k));
    if (!had) {
      out.push(raw);
      continue;
    }
    let line = raw;
    for (const k of COUPON_VARIABLES) line = line.split(k).join("");
    // 빈 괄호·중복 공백·줄 끝 구분기호 정리
    line = line
      .replace(/\(\s*\)|\[\s*\]|\{\s*\}/g, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t~·,\-|:]+$/g, "")
      .trimEnd();
    // 쿠폰 정보를 적으려고 만든 줄(예: "· 혜택 ()", "· 사용 기한")은 통째로 버린다
    const meaningful = (line.match(/[가-힣A-Za-z0-9]/g) ?? []).length;
    if (meaningful >= 6) out.push(line);
  }
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}
