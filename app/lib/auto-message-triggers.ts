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
  /** 이 알림이 자동 발송되는 대상 설명 (수신 대상은 트리거가 결정) */
  recipient: string;
  /** 일정 기준(schedule)의 기준일 명칭. 예: "만료일", "생일". immediate 전용이면 생략 */
  basisNoun?: string;
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
      { key: "contract_completed", label: "계약 완료 시", bases: ["immediate"], recipient: "계약을 완료한 회원" },
      { key: "rental_purchased", label: "대여권 구매 시", bases: ["immediate"], recipient: "대여권을 구매한 회원" },
      { key: "birthday", label: "생일자 고객", bases: ["schedule"], recipient: "생일이 다가온 회원", basisNoun: "생일" },
      { key: "membership_new", label: "이용권 신규 등록 시", bases: ["immediate"], recipient: "이용권을 신규 등록한 회원" },
      { key: "membership_renew", label: "이용권 재등록 시", bases: ["immediate"], recipient: "이용권을 재등록한 회원" },
      {
        key: "first_purchase",
        label: "신규등록 후 첫 상품구매 시",
        bases: ["immediate"],
        recipient: "가입 후 처음으로 회원권·수강권을 구매한 회원",
        defaultBody:
          "#회원명#님, #센터명#의 첫 등록을 환영합니다! 🎉\n#결제내역# 결제가 완료되었어요.\n궁금한 점은 언제든 데스크에 말씀해 주세요.",
      },
      { key: "long_absence", label: "장기 미출석 시", bases: ["schedule", "count"], recipient: "장기 미출석(휴면) 회원", basisNoun: "마지막 출석일" },
      { key: "coupon_expired", label: "쿠폰 만료", bases: ["immediate", "schedule"], recipient: "쿠폰이 만료된 회원", basisNoun: "쿠폰 만료일" },
    ],
  },
  {
    key: "product",
    label: "상품 관련",
    triggers: [
      { key: "membership_expiring", label: "회원권 만료 전", bases: ["schedule"], recipient: "회원권 만료가 임박한 회원", basisNoun: "회원권 만료일" },
      { key: "membership_expired", label: "회원권 만료 시", bases: ["immediate", "schedule"], recipient: "회원권이 만료된 회원", basisNoun: "회원권 만료일" },
      { key: "pass_expiring", label: "수강권 만료 전", bases: ["schedule"], recipient: "수강권 만료가 임박한 회원", basisNoun: "수강권 만료일" },
      { key: "pass_expired", label: "수강권 만료 시", bases: ["immediate", "schedule"], recipient: "수강권이 만료된 회원", basisNoun: "수강권 만료일" },
      { key: "class_expiring", label: "클래스 만료 전", bases: ["schedule"], recipient: "클래스 수업 만료가 임박한 회원", basisNoun: "클래스 만료일" },
      { key: "class_expired", label: "클래스 만료 시", bases: ["immediate", "schedule"], recipient: "클래스 수업이 만료된 회원", basisNoun: "클래스 만료일" },
      { key: "locker_expiring", label: "락커 만료 전", bases: ["schedule"], recipient: "락커 만료가 임박한 회원", basisNoun: "락커 만료일" },
      { key: "locker_expired", label: "락커 만료 시", bases: ["immediate", "schedule"], recipient: "락커가 만료된 회원", basisNoun: "락커 만료일" },
      { key: "sportswear_expiring", label: "운동복 만료 전", bases: ["schedule"], recipient: "운동복 만료가 임박한 회원", basisNoun: "운동복 만료일" },
      { key: "sportswear_expired", label: "운동복 만료 시", bases: ["immediate", "schedule"], recipient: "운동복이 만료된 회원", basisNoun: "운동복 만료일" },
      { key: "product_hold", label: "상품 홀딩", bases: ["immediate"], recipient: "상품을 홀딩한 회원" },
      { key: "hold_ending_soon", label: "홀딩 종료 임박", bases: ["schedule"], recipient: "홀딩 종료가 임박한 회원", basisNoun: "홀딩 종료일" },
    ],
  },
  {
    key: "reservation",
    label: "예약 관련",
    triggers: [
      { key: "class_booked", label: "수업 예약 시", bases: ["immediate"], recipient: "수업을 예약한 회원" },
      { key: "class_cancelled", label: "수업 예약 취소 시", bases: ["immediate"], recipient: "수업 예약을 취소한 회원" },
      { key: "facility_changed", label: "시설 예약 변경 시", bases: ["immediate"], recipient: "시설 예약을 변경한 회원" },
      { key: "facility_booked", label: "시설 예약 시", bases: ["immediate"], recipient: "시설을 예약한 회원" },
      { key: "facility_cancelled", label: "시설 예약 취소 시", bases: ["immediate"], recipient: "시설 예약을 취소한 회원" },
    ],
  },
  {
    key: "event",
    label: "이벤트 전송",
    triggers: [
      {
        key: "attendance_coupon",
        label: "출석일수 기준 쿠폰 전송",
        // 만료일 기준 일정 발송만 — '만료 당일'은 0일로 설정한다(즉시형은 사건 hook 이 필요해 제외)
        bases: ["schedule"],
        recipient: "지정 상품을 쓰는 회원 중 출석일수가 기준 미만인 회원",
        basisNoun: "만료일",
        defaultBody:
          "#회원명#님, #센터명#입니다.\n이용권(#상품명#) 만료가 #전송기준# 남았어요.\n이번 기간 출석은 #출석일수#일이었습니다. 다음 기간엔 더 자주 만나뵐 수 있도록 할인 혜택을 준비했어요.",
      },
    ],
  },
];

export const ALL_TRIGGERS: AutoMsgTrigger[] = AUTO_MESSAGE_CATEGORIES.flatMap((c) => c.triggers);

export const TRIGGER_BY_KEY: Record<string, AutoMsgTrigger> = Object.fromEntries(
  ALL_TRIGGERS.map((t) => [t.key, t])
);

export const AUTO_MESSAGE_TRIGGER_KEYS: Set<string> = new Set(ALL_TRIGGERS.map((t) => t.key));

/**
 * '만료' 판정 기준 — 기간(만료일)이 지났을 때 / 횟수를 모두 소진했을 때.
 * 지금은 수강권 만료 시(pass_expired)에서만 고를 수 있다.
 */
export type ExpiryBasis = "period" | "sessions";

export const EXPIRY_BASIS_TRIGGERS = new Set<string>(["pass_expired"]);

export const EXPIRY_BASIS_LABEL: Record<ExpiryBasis, string> = {
  period: "기간 만료",
  sessions: "횟수 소진",
};

export const EXPIRY_BASIS_DESC: Record<ExpiryBasis, string> = {
  period: "수강권 만료일(기간)이 지난 회원",
  sessions: "수강권 잔여 횟수를 모두 소진한 회원",
};

/**
 * 출석일수 기준 쿠폰 전송 규칙 (trigger attendance_coupon).
 * `crm_auto_message_settings.config.attendance_rules` 에 배열로 저장.
 *
 * 한 줄 = "이 상품을 쓴 회원 중 출석일수가 N일 미만이면 이 쿠폰". 상품마다 여러 줄(단계)을 둘 수 있고,
 * 한 회원이 여러 줄에 걸리면 **기준 일수가 가장 작은 줄(=혜택이 큰 쪽) 하나만** 발송한다.
 */
export interface AttendanceCouponRule {
  /** 대상 회원권 상품 id (crm_products.id) */
  product_id: number;
  /** 이 일수 '미만' 이면 대상 (예: 14 → 13일 이하) */
  max_days: number;
  /** 보낼 쿠폰 종류 (crm_coupons.id) */
  coupon_id: number;
}

/**
 * 실제로 발송 로직이 붙어 있는 트리거.
 *
 * 🚨 여기 없는 트리거는 설정을 켜도 **아무 것도 나가지 않는다**(조건 스캔도, 즉시 발사도 없음).
 *   목록에만 있고 구현이 없는 알림을 켜 둔 채 "보냈겠지" 하고 있는 사고를 막기 위해
 *   설정 화면에서 경고를 띄우는 데 쓴다.
 *   - 스캔형은 _engine.ts 의 SCAN_TRIGGERS 와,
 *   - 즉시형은 fireAutoMessage()/fireFirstPurchaseMessage() 호출처와 일치해야 한다.
 */
export const DISPATCHABLE_TRIGGERS = new Set<string>([
  // 스캔형(크론이 매시간 조건 검사)
  "birthday",
  "membership_expiring",
  "membership_expired",
  "pass_expiring",
  "pass_expired",
  "class_expiring",
  "class_expired",
  "locker_expiring",
  "locker_expired",
  "sportswear_expiring",
  "sportswear_expired",
  "long_absence",
  "attendance_coupon",
  "hold_ending_soon",
  // 즉시형(발급·결제 직후 발사) — 신규/재등록은 스캔형에도 있다
  "membership_new",
  "membership_renew",
  "first_purchase",
]);

export const ATTENDANCE_RULE_TRIGGER = "attendance_coupon";

/** 규칙 1줄의 설명 문구 — 설정 화면·미리보기 공용 */
export function attendanceRuleText(
  rule: { max_days: number },
  productName: string,
  couponName: string
): string {
  return `${productName} · 출석 ${rule.max_days}일 미만 → ${couponName}`;
}

/**
 * 일정 기준(schedule) 기본 일수 — 설정 화면과 저장 API 가 같은 값을 쓴다.
 * 🚨 일정 기준인데 일수가 비어 있으면 엔진이 0일(=기준일 당일)로 보고 발송한다.
 *    목록에서 스위치만 켜서 만들어진 설정이 '당일 발송'으로 새는 걸 막기 위한 기본값.
 */
export function defaultSendDays(triggerKey: string): number {
  return triggerKey === ATTENDANCE_RULE_TRIGGER ? 7 : 3;
}

/** 트리거가 허용하는 전송 기준으로 맞춘다(허용 목록에 없으면 첫 항목). */
export function coerceSendBasis(triggerKey: string, basis: string | null | undefined): SendBasis {
  const bases = TRIGGER_BY_KEY[triggerKey]?.bases ?? ["immediate"];
  return bases.includes(basis as SendBasis) ? (basis as SendBasis) : bases[0];
}

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
/**
 * 메세지 치환 변수.
 *
 * - `example` : 변수를 쓴 짧은 문구(07 변수 버튼 호버 미리보기의 '보내는 문구')
 * - `sample`  : 회원에게 치환돼 나가는 예시값('받는 메세지'). 센터 값(센터명·전화·주소·
 *   운영시간·앱설치링크)은 발송 때 실제 센터 값으로 바뀌므로, 화면에서는
 *   /api/crm/auto-messages/var-samples 가 돌려준 실제 값으로 덮어쓴다.
 *
 * 🚨 변수를 새로 추가하면 렌더 경로 5곳(renderMessage 시그니처 · 크론 · /run ·
 *   test-send · fireAutoMessage)을 모두 고쳐야 한다. (트리거 전용 값은 해당 경로만 — 예: 홀딩일은 즉시형에 없음) 한 곳이라도 빠지면 그 경로만 빈칸으로 발송된다.
 */
export const MESSAGE_VARIABLES: {
  token: string;
  desc: string;
  /** 변수를 쓴 짧은 예시 문구 */
  example: string;
  /** 그 문구가 회원에게 치환돼 보이는 값 */
  sample: string;
}[] = [
  { token: "#센터명#", desc: "센터 이름", example: "[#센터명#] 안내드립니다", sample: "우리 센터" },
  { token: "#회원명#", desc: "회원 이름", example: "#회원명#님, 안녕하세요", sample: "홍길동" },
  { token: "#상품명#", desc: "구매/대상 상품명", example: "#상품명# 이용권 안내", sample: "헬스 3개월" },
  {
    token: "#결제내역#",
    desc: "결제 상세(상품명·금액)",
    example: "#결제내역# 결제가 완료됐어요",
    sample: "헬스 3개월 150,000원",
  },
  { token: "#만료일#", desc: "대상 상품의 만료 날짜", example: "#만료일#까지 이용 가능해요", sample: "2026-12-31" },
  {
    token: "#마지막방문일#",
    desc: "마지막 출석 날짜 (장기 미출석 알림용)",
    example: "마지막 방문 #마지막방문일#",
    sample: "2026-10-02",
  },
  { token: "#전송기준#", desc: "남은 기간(예: 10일)", example: "만료까지 #전송기준# 남았어요", sample: "7일" },
  {
    token: "#출석일수#",
    desc: "이용권 기간 중 출석한 날짜 수 (출석일수 쿠폰용)",
    example: "이번 이용권 #출석일수#일 출석하셨어요",
    sample: "12",
  },
  { token: "#시작일#", desc: "대상 상품의 시작 날짜", example: "#시작일#부터 시작돼요", sample: "2026-10-01" },
  {
    token: "#잔여횟수#",
    desc: "수강권 남은 횟수 (수강권 알림에서만 값이 채워짐)",
    example: "남은 횟수 #잔여횟수#회",
    sample: "3",
  },
  {
    token: "#담당강사#",
    desc: "수강권 담당 강사 이름 (수강권 알림에서만)",
    example: "담당 #담당강사# 강사님",
    sample: "김지도",
  },
  { token: "#회원번호#", desc: "회원 출석번호", example: "회원번호 #회원번호#", sample: "1024" },
  { token: "#마일리지#", desc: "현재 보유 마일리지", example: "마일리지 #마일리지#P 보유 중", sample: "10,000" },
  { token: "#센터전화#", desc: "센터 대표 전화번호", example: "문의 #센터전화#", sample: "053-000-0000" },
  { token: "#센터주소#", desc: "센터 주소", example: "오시는 길 #센터주소#", sample: "센터 설정에 등록한 주소" },
  {
    token: "#운영시간#",
    desc: "센터 운영 시간 (센터설정에 등록한 값)",
    example: "운영시간 #운영시간#",
    sample: "센터 설정에 등록한 운영시간",
  },
  { token: "#미수금#", desc: "남은 미수금 (없으면 0)", example: "미수금 #미수금#원", sample: "50,000" },
  { token: "#총출석#", desc: "지금까지 출석한 날짜 수 (누적)", example: "누적 출석 #총출석#일", sample: "24" },
  {
    token: "#다음수업#",
    desc: "예약된 다음 수업 일시 (예: 11/8(토) 14:00)",
    example: "다음 수업 #다음수업#",
    sample: "11/8(토) 14:00",
  },
  { token: "#가입일#", desc: "센터 첫 등록일", example: "가입일 #가입일#", sample: "2026-09-12" },
  {
    token: "#홀딩시작일#",
    desc: "홀딩 시작 날짜 (홀딩 알림에서만 값이 채워짐)",
    example: "홀딩 시작 #홀딩시작일#",
    sample: "2026-11-03",
  },
  {
    token: "#홀딩종료일#",
    desc: "홀딩 마지막 날짜 (다음 날부터 다시 이용)",
    example: "홀딩 종료 #홀딩종료일#",
    sample: "2026-11-16",
  },
  {
    token: "#앱설치링크#",
    desc: "회원 앱 설치 링크",
    example: "회원 앱 설치 #앱설치링크#",
    sample: "https://moducm.com/join/...",
  },
  // 쿠폰 변수 — 06 쿠폰 첨부(또는 출석일수 쿠폰 규칙)로 쿠폰이 붙은 알림에서만 값이 채워진다.
  // 쿠폰이 없으면 이 변수들은 발송 직전에 자동으로 지워진다(글자 그대로 나가지 않음).
  {
    token: "#쿠폰명#",
    desc: "첨부한 쿠폰 이름 (쿠폰 첨부한 알림만)",
    example: "#쿠폰명#을 드려요",
    sample: "감사 쿠폰",
  },
  { token: "#쿠폰혜택#", desc: "쿠폰 혜택 (예: 20% 할인)", example: "#쿠폰혜택# 혜택", sample: "20% 할인" },
  { token: "#쿠폰코드#", desc: "회원에게 발급된 쿠폰 코드", example: "쿠폰코드 #쿠폰코드#", sample: "ABCD-1234" },
  { token: "#쿠폰기한#", desc: "쿠폰 사용 기한", example: "#쿠폰기한# 사용 가능", sample: "2026.12.31까지" },
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
