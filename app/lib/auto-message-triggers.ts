/**
 * 자동 메세지(자동알림) 트리거 카탈로그.
 * 프론트(설정 UI)와 API(검증·발송) 양쪽에서 공유.
 * 실제 발송은 회원용 앱/문자 채널 연동 후 단계적으로 붙인다. (현재는 on/off + 설정 저장까지)
 */

export type SendBasis = "immediate" | "schedule" | "count";

export interface AutoMsgTrigger {
  key: string;
  label: string;
  /** 허용하는 전송 기준. 첫 항목이 기본값. */
  bases: SendBasis[];
  /** 메세지 입력 기본 문구 */
  defaultBody?: string;
}

export interface AutoMsgCategory {
  key: string;
  label: string;
  triggers: AutoMsgTrigger[];
}

export const AUTO_MESSAGE_CATEGORIES: AutoMsgCategory[] = [
  {
    key: "customer",
    label: "고객 관련",
    triggers: [
      { key: "contract_completed", label: "계약 완료 시", bases: ["immediate"] },
      { key: "rental_purchased", label: "대여권 구매 시", bases: ["immediate"] },
      { key: "birthday", label: "생일자 고객", bases: ["schedule"] },
      { key: "membership_new", label: "이용권 신규 등록 시", bases: ["immediate"] },
      { key: "membership_renew", label: "이용권 재등록 시", bases: ["immediate"] },
      { key: "long_absence", label: "장기 미출석 시", bases: ["schedule", "count"] },
      { key: "coupon_expired", label: "쿠폰 만료", bases: ["immediate", "schedule"] },
    ],
  },
  {
    key: "product",
    label: "상품 관련",
    triggers: [
      { key: "locker_expired", label: "락커 만료", bases: ["immediate", "schedule"] },
      { key: "product_hold", label: "상품 홀딩", bases: ["immediate"] },
      { key: "pass_expired", label: "수강권 만료 시", bases: ["immediate", "schedule"] },
      { key: "pass_expiring", label: "수강권 만료 전", bases: ["schedule"] },
      { key: "sportswear_expired", label: "운동복 만료", bases: ["immediate", "schedule"] },
      { key: "hold_ending_soon", label: "홀딩 종료 임박", bases: ["schedule"] },
      { key: "membership_expired", label: "회원권 만료 시", bases: ["immediate", "schedule"] },
      { key: "membership_expiring", label: "회원권 만료 전", bases: ["schedule"] },
    ],
  },
  {
    key: "reservation",
    label: "예약 관련",
    triggers: [
      { key: "class_booked", label: "수업 예약 시", bases: ["immediate"] },
      { key: "class_cancelled", label: "수업 예약 취소 시", bases: ["immediate"] },
      { key: "facility_changed", label: "시설 예약 변경 시", bases: ["immediate"] },
      { key: "facility_booked", label: "시설 예약 시", bases: ["immediate"] },
      { key: "facility_cancelled", label: "시설 예약 취소 시", bases: ["immediate"] },
    ],
  },
];

export const ALL_TRIGGERS: AutoMsgTrigger[] = AUTO_MESSAGE_CATEGORIES.flatMap((c) => c.triggers);

export const TRIGGER_BY_KEY: Record<string, AutoMsgTrigger> = Object.fromEntries(
  ALL_TRIGGERS.map((t) => [t.key, t])
);

export const AUTO_MESSAGE_TRIGGER_KEYS: Set<string> = new Set(ALL_TRIGGERS.map((t) => t.key));

export const SEND_BASIS_LABEL: Record<SendBasis, string> = {
  immediate: "즉시",
  schedule: "일정 기준",
  count: "횟수 기준",
};

/** 수신 대상 세그먼트 (최대 3개 선택, 미선택 시 조건 해당 전체) */
export const SEGMENT_OPTIONS: { key: string; label: string }[] = [
  { key: "all", label: "전체 고객" },
  { key: "valid", label: "유효 회원" },
  { key: "expiring", label: "만료 임박" },
  { key: "expired", label: "만료 회원" },
  { key: "dormant", label: "장기 미출석(휴면)" },
  { key: "new", label: "신규 회원" },
  { key: "birthday", label: "생일자" },
];

/** 메세지 입력에 쓰는 치환 변수 (클릭 시 자동 입력) */
export const MESSAGE_VARIABLES: { token: string; desc: string }[] = [
  { token: "#센터명#", desc: "센터 이름" },
  { token: "#회원명#", desc: "회원 이름" },
  { token: "#상품명#", desc: "구매/대상 상품명" },
  { token: "#결제내역#", desc: "결제 상세(상품명·금액)" },
  { token: "#만료일#", desc: "만료 날짜" },
  { token: "#전송기준#", desc: "남은 기간(예: 10일)" },
  { token: "#앱설치링크#", desc: "회원 앱 설치 링크" },
];

/**
 * 한국형 SMS 바이트 계산 (EUC-KR 근사): ASCII 1바이트, 그 외(한글 등) 2바이트.
 * 90바이트 이하 SMS, 초과 시 LMS.
 */
export function smsByteLength(text: string): number {
  let bytes = 0;
  for (const ch of text) {
    bytes += ch.charCodeAt(0) > 0x7f ? 2 : 1;
  }
  return bytes;
}

export function smsKind(text: string): "SMS" | "LMS" {
  return smsByteLength(text) <= 90 ? "SMS" : "LMS";
}
