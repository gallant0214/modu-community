/**
 * 문자 발송 가능 센터 + 잠금 안내 문구 (클라이언트·서버 공용).
 *
 * 문자는 스페셜바디 범어점(center 1)만 사용한다. 다른 센터는 앱 푸시·알림은 그대로 쓰되
 * 문자 관련 화면·발송은 모두 '준비중'으로 막는다(발신번호·요금 보호).
 * 서버 전용 모듈(crm-sms.ts)을 클라이언트에서 import 하면 안 되므로 이 값만 따로 둔다.
 */
export const SMS_ENABLED_CENTER_IDS = new Set<number>([1]);

export function smsAllowedForCenter(centerId: number | null | undefined): boolean {
  return centerId != null && SMS_ENABLED_CENTER_IDS.has(centerId);
}

/** 문자 기능을 막을 때 사용자에게 보여줄 문구 — 화면·API 모두 이 문구로 통일 */
export const SMS_NOT_READY_MESSAGE = "문자메세지 서비스 준비중입니다";
