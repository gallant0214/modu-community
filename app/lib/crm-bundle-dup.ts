import { computeExpiryYmd } from "@/app/lib/duration-convert";

/**
 * 발급 장바구니 중복 구성품 경고.
 * 묶음 상품(예: 스포츠바우처 1개월 = 회원권 + 락커 + 운동복)에 이미 들어 있는 락커·운동복을
 * 같은 결제에 따로 또 담아 같은 기간에 두 장이 발급되던 실수를 막는다(2026-10-05 임현정 회원 사례).
 * 막지는 않고 경고만 — 일부러 두 장을 줄 수도 있으므로 판단은 직원이 한다.
 */

export interface DupCheckLine {
  type: string;
  name: string;
  startDate: string;
  durationValue: number;
  durationUnit: string;
  components?: {
    type: string;
    name?: string;
    billing_mode?: string;
    duration_value?: number;
    duration_unit?: string;
  }[];
}

const TYPE_LABEL: Record<string, string> = { locker: "락커", apparel: "운동복" };
const WATCHED = new Set(Object.keys(TYPE_LABEL));

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/** 장바구니에서 '묶음 구성품과 같은 종류·겹치는 기간' 인 단독 상품을 찾아 안내 문구 목록으로 돌려준다. */
export function findBundleDupWarnings(lines: DupCheckLine[]): string[] {
  const out: string[] = [];
  lines.forEach((bundle, bi) => {
    for (const comp of bundle.components ?? []) {
      if (!WATCHED.has(comp.type) || comp.billing_mode === "count") continue;
      const cStart = bundle.startDate;
      const cEnd = computeExpiryYmd(cStart, comp.duration_value ?? 0, comp.duration_unit ?? "day");
      lines.forEach((other, oi) => {
        if (oi === bi || other.type !== comp.type || !other.startDate) return;
        const oEnd = computeExpiryYmd(other.startDate, other.durationValue, other.durationUnit);
        if (!overlaps(cStart, cEnd, other.startDate, oEnd)) return;
        out.push(
          `'${bundle.name}' 에 ${TYPE_LABEL[comp.type]}(${comp.name || "구성 상품"})가 이미 들어 있어요. ` +
            `따로 담은 '${other.name}' 과 기간이 겹쳐 ${TYPE_LABEL[comp.type]}가 두 장 발급돼요.`
        );
      });
    }
  });
  return out;
}
