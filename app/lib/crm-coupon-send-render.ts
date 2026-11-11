/**
 * 쿠폰 발송 안내 문구 → 회원별 실제 문구 (서버 전용).
 * 발송(POST /api/crm/coupons/send)과 발급 내역의 '발송 내용' 다시 보기가 같은 함수를 쓴다.
 * 자동 메세지와 같은 치환 함수(renderMessage)로 회원·센터 변수를, #쿠폰조건# 은 그 줄째로 처리한다.
 */
import { benefitText, conditionText, fillCouponCondition, type CouponDef } from "@/app/lib/crm-coupons";
import { fmtExpiry } from "@/app/lib/crm-auto-coupon-vars";
import {
  loadCenterAddress,
  loadCenterHours,
  loadCenterPhone,
  loadJoinLink,
  loadMembersCommonVars,
  renderMessage,
  type Match,
} from "@/app/api/crm/auto-messages/_engine";

/** 회원별 값이 들어가는 변수 — 하나라도 쓰면 회원 정보를 조회한다 */
export const MEMBER_VAR_TOKENS = ["#회원명#", "#회원번호#", "#마일리지#", "#미수금#", "#총출석#", "#마지막방문일#", "#다음수업#", "#가입일#"];

/** 발송 뒤 값이 바뀔 수 있는 회원 변수(이름 제외) — 다시 만든 문구가 그때와 다를 수 있는지 판단용 */
export const VOLATILE_MEMBER_TOKENS = MEMBER_VAR_TOKENS.filter((t) => t !== "#회원명#");

/**
 * memberIds 각각의 최종 문구. 문구에 쓴 변수만 조회한다.
 * codeOf: 회원별 쿠폰코드, expiresAt: 발급 만료일(YYYY-MM-DD | null)
 */
export async function renderCouponMessages(opts: {
  centerId: number;
  centerName: string;
  template: string;
  coupon: CouponDef;
  expiresAt: string | null;
  memberIds: number[];
  codeOf: Map<number, string>;
}): Promise<Map<number, string>> {
  const { centerId, centerName, template, coupon, expiresAt, memberIds, codeOf } = opts;
  const has = (t: string) => template.includes(t);
  const [memberVars, centerPhone, centerAddress, centerHours, appLink] = await Promise.all([
    MEMBER_VAR_TOKENS.some(has)
      ? loadMembersCommonVars(centerId, memberIds, template)
      : Promise.resolve(new Map<number, Match>()),
    has("#센터전화#") ? loadCenterPhone(centerId) : Promise.resolve(""),
    has("#센터주소#") ? loadCenterAddress(centerId) : Promise.resolve(""),
    has("#운영시간#") ? loadCenterHours(centerId) : Promise.resolve(""),
    has("#앱설치링크#") ? loadJoinLink(centerId) : Promise.resolve(""),
  ]);
  const withCondition = fillCouponCondition(template, conditionText(coupon));
  const couponBase = { name: coupon.name, benefit: benefitText(coupon), expires: fmtExpiry(expiresAt) };
  const out = new Map<number, string>();
  for (const id of memberIds) {
    const m = memberVars.get(id);
    out.set(
      id,
      renderMessage(withCondition, {
        center: centerName,
        name: m?.name ?? "",
        memberNo: m?.memberNo,
        mileage: m?.mileage,
        outstanding: m?.outstanding,
        totalAttend: m?.totalAttend,
        nextLesson: m?.nextLesson,
        joinDate: m?.joinDate,
        lastVisit: m?.lastVisit,
        centerPhone,
        centerAddress,
        centerHours,
        appLink,
        couponVars: { ...couponBase, code: codeOf.get(id) ?? "" },
      }).trim()
    );
  }
  return out;
}
