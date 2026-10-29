/**
 * PG(이니시스)로 넘길 상품명 — 회원에게 보여주는 한글 상품명과 **분리**한다.
 *
 * 왜 필요한가:
 *   이니시스 심사에서 '회원권·운동복·락커' 가 체육시설 이용권 판매로 읽힌다는
 *   지적을 받았다(2026-10-29). 포트원 `name` 은 이니시스 `goodname` 하나로 들어가고
 *   그 값이 **결제창 표기와 전표 기록을 겸한다** — 전표에 종목을 남기지 않으려면
 *   결제창 표기까지 코드로 바꾸는 수밖에 없다.
 *
 * 🚨 우리 결제 페이지와 CRM·매출·영수증은 계속 `crm_orders.product_name` 의 한글
 *    이름을 쓴다. 이 함수 결과는 **PG 로 넘기는 한 곳에서만** 쓴다.
 */

/** 상품 종류 → 전표에 남길 코드 */
const TYPE_CODE: Record<string, string> = {
  membership: "H",
  apparel: "W",
  locker: "L",
};

/**
 * 🚨 매핑에 없는 종류는 한글 이름으로 흘려보내지 않고 이 코드로 묶는다.
 *    ONLINE_SELLABLE_TYPES 에는 레슨류(personal/group/class)도 들어 있어서,
 *    상품 하나에 '온라인 판매' 를 켜는 순간 종목명이 전표로 새어나갈 수 있다.
 */
const FALLBACK_CODE = "E";

/** 묶음 주문의 코드 순서 — 결제 순서와 무관하게 늘 같은 문자열이 나오게 한다 */
const CODE_ORDER = ["H", "W", "L", FALLBACK_CODE];

export function typeCode(type: string | null | undefined): string {
  return TYPE_CODE[(type ?? "").trim()] ?? FALLBACK_CODE;
}

/** 기간 표기 — 코드만으로는 무엇을 샀는지 전혀 알 수 없어 기간은 남긴다 */
function periodLabel(p: {
  durationValue?: number | null;
  durationUnit?: string | null;
  totalSessions?: number | null;
}): string {
  const v = Math.max(0, Math.floor(Number(p.durationValue) || 0));
  if (v > 0) {
    if (p.durationUnit === "month") return `${v}개월`;
    if (p.durationUnit === "year") return `${v}년`;
    return `${v}일`;
  }
  const n = Math.max(0, Math.floor(Number(p.totalSessions) || 0));
  return n > 0 ? `${n}회` : "";
}

/**
 * 주문에 담긴 종류들 + 대표 상품의 기간 → PG 상품명.
 *   회원권 3개월 한 건            → "H 3개월"
 *   회원권 3개월 + 운동복 1개월   → "H+W 3개월"  (기간은 대표 상품 기준)
 *   기간이 없는 회차형 20회       → "H 20회"
 */
export function pgProductName(p: {
  types: (string | null | undefined)[];
  durationValue?: number | null;
  durationUnit?: string | null;
  totalSessions?: number | null;
}): string {
  const codes = Array.from(new Set(p.types.map(typeCode)));
  codes.sort((a, b) => CODE_ORDER.indexOf(a) - CODE_ORDER.indexOf(b));
  const head = codes.length > 0 ? codes.join("+") : FALLBACK_CODE;
  const period = periodLabel(p);
  return period ? `${head} ${period}` : head;
}
