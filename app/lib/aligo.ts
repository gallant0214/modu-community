/**
 * 알리고(Aligo) SMS API 연동 헬퍼.
 * REST(form-data) POST 방식. SDK 불필요.
 * 환경변수: ALIGO_API_KEY, ALIGO_USER_ID, ALIGO_SENDER
 * 문서: https://smartsms.aligo.in/admin/api/spec.html
 */

const ALIGO_BASE = "https://apis.aligo.in";

export function aligoConfigured(): boolean {
  return !!(process.env.ALIGO_API_KEY && process.env.ALIGO_USER_ID && process.env.ALIGO_SENDER);
}

function creds() {
  const key = process.env.ALIGO_API_KEY ?? "";
  const user_id = process.env.ALIGO_USER_ID ?? "";
  const sender = (process.env.ALIGO_SENDER ?? "").replace(/\D/g, "");
  return { key, user_id, sender };
}

/** 숫자만 남긴 전화번호 */
export function normalizePhone(p: string): string {
  return (p ?? "").replace(/\D/g, "");
}

/** UTF-8 바이트 길이(알리고는 90byte 초과 시 LMS) */
export function byteLength(s: string): number {
  return new TextEncoder().encode(s ?? "").length;
}

/** 90byte 이하=SMS, 초과=LMS */
export function inferMsgType(msg: string): "SMS" | "LMS" {
  return byteLength(msg) <= 90 ? "SMS" : "LMS";
}

export interface AligoSendResult {
  ok: boolean;
  result_code: number;
  message: string;
  msg_id?: string | number;
  success_cnt?: number;
  error_cnt?: number;
  msg_type?: string;
}

/**
 * 문자 발송. receivers = 수신번호 배열(최대 1000).
 * testmode=true 면 실제 발송/과금 없이 검증만.
 */
export async function aligoSend(opts: {
  receivers: string[];
  msg: string;
  title?: string;
  msgType?: "SMS" | "LMS" | "MMS";
  testmode?: boolean;
  rdate?: string; // 예약일 YYYYMMDD
  rtime?: string; // 예약시각 HHMM
}): Promise<AligoSendResult> {
  const { key, user_id, sender } = creds();
  const receiver = opts.receivers.map(normalizePhone).filter(Boolean).join(",");
  const form = new URLSearchParams();
  form.set("key", key);
  form.set("user_id", user_id);
  form.set("sender", sender);
  form.set("receiver", receiver);
  form.set("msg", opts.msg);
  if (opts.msgType) form.set("msg_type", opts.msgType);
  if (opts.title) form.set("title", opts.title);
  if (opts.rdate) form.set("rdate", opts.rdate);
  if (opts.rtime) form.set("rtime", opts.rtime);
  form.set("testmode_yn", opts.testmode ? "Y" : "N");

  const res = await fetch(`${ALIGO_BASE}/send/`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const data = await res.json().catch(() => ({}));
  const code = Number(data?.result_code);
  return {
    ok: code === 1,
    result_code: Number.isFinite(code) ? code : -999,
    message: String(data?.message ?? ""),
    msg_id: data?.msg_id,
    success_cnt: data?.success_cnt != null ? Number(data.success_cnt) : undefined,
    error_cnt: data?.error_cnt != null ? Number(data.error_cnt) : undefined,
    msg_type: data?.msg_type,
  };
}

export interface AligoRemain {
  ok: boolean;
  result_code: number;
  message: string;
  SMS_CNT?: number;
  LMS_CNT?: number;
  MMS_CNT?: number;
}

/** 발송 가능 잔여 건수 조회 */
export async function aligoRemain(): Promise<AligoRemain> {
  const { key, user_id } = creds();
  const form = new URLSearchParams();
  form.set("key", key);
  form.set("user_id", user_id);
  const res = await fetch(`${ALIGO_BASE}/remain/`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const data = await res.json().catch(() => ({}));
  const code = Number(data?.result_code);
  return {
    ok: code === 1,
    result_code: Number.isFinite(code) ? code : -999,
    message: String(data?.message ?? ""),
    SMS_CNT: data?.SMS_CNT != null ? Number(data.SMS_CNT) : undefined,
    LMS_CNT: data?.LMS_CNT != null ? Number(data.LMS_CNT) : undefined,
    MMS_CNT: data?.MMS_CNT != null ? Number(data.MMS_CNT) : undefined,
  };
}
