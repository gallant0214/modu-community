/**
 * 문자 길이(byte)·유형(SMS/LMS) 판정 — 화면(글자수 표시)과 서버(실제 발송 유형) 공용.
 *
 * 🚨 통신사·솔라피 기준: 영문·숫자·공백·줄바꿈 1byte, 한글·한자·특수문자 2byte.
 *   90byte(한글 45자) 이하 = 단문 SMS, 넘으면 장문 LMS(최대 2,000byte).
 *   UTF-8 길이(한글 3byte)로 세면 한글 31~45자 문자가 비싼 LMS 로 나가니 쓰지 말 것.
 *   이모지처럼 기본 문자표 밖 글자는 넉넉히 4byte 로 센다 — 적게 세서 SMS 한도를 넘기는 것보다 안전.
 * 클라이언트에서도 import 하므로 서버 전용 모듈을 가져오지 않는다.
 */
export const SMS_MAX_BYTES = 90;
export const LMS_MAX_BYTES = 2000;

export function smsByteLength(s: string | null | undefined): number {
  let n = 0;
  for (const ch of s ?? "") {
    const cp = ch.codePointAt(0) ?? 0;
    n += cp <= 0x7f ? 1 : cp > 0xffff ? 4 : 2;
  }
  return n;
}

export function smsTypeFor(s: string | null | undefined): "SMS" | "LMS" {
  return smsByteLength(s) <= SMS_MAX_BYTES ? "SMS" : "LMS";
}
