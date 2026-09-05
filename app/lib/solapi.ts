/**
 * 솔라피(Solapi) SMS API 연동 헬퍼.
 * HMAC-SHA256 서명 인증 → IP 제한 불필요(서버리스/Vercel 적합).
 * 환경변수: SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER
 * 문서: https://developers.solapi.com
 */
import crypto from "node:crypto";

const SOLAPI_BASE = "https://api.solapi.com";

export function solapiConfigured(): boolean {
  return !!(process.env.SOLAPI_API_KEY && process.env.SOLAPI_API_SECRET && process.env.SOLAPI_SENDER);
}

function authHeader(): string {
  const key = process.env.SOLAPI_API_KEY ?? "";
  const secret = process.env.SOLAPI_API_SECRET ?? "";
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(32).toString("hex");
  const signature = crypto.createHmac("sha256", secret).update(date + salt).digest("hex");
  return `HMAC-SHA256 apiKey=${key}, date=${date}, salt=${salt}, signature=${signature}`;
}

export function normalizePhone(p: string): string {
  return (p ?? "").replace(/\D/g, "");
}

/** UTF-8 바이트 길이(90byte 초과 시 LMS) */
export function byteLength(s: string): number {
  return new TextEncoder().encode(s ?? "").length;
}

export function inferMsgType(msg: string): "SMS" | "LMS" {
  return byteLength(msg) <= 90 ? "SMS" : "LMS";
}

export interface SolapiSendResult {
  ok: boolean;
  total: number;
  success: number;
  failed: number;
  message: string;
  groupId?: string;
}

/** 여러 수신자에게 동일 내용 발송(send-many/detail) */
export async function solapiSend(opts: {
  receivers: string[];
  msg: string;
  subject?: string;
  msgType?: "SMS" | "LMS";
}): Promise<SolapiSendResult> {
  const sender = normalizePhone(process.env.SOLAPI_SENDER ?? "");
  const type = opts.msgType ?? inferMsgType(opts.msg);
  const messages = opts.receivers.map((to) => ({
    to: normalizePhone(to),
    from: sender,
    text: opts.msg,
    type,
    ...(type === "LMS" && opts.subject ? { subject: opts.subject } : {}),
  }));

  const res = await fetch(`${SOLAPI_BASE}/messages/v4/send-many/detail`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  const data = await res.json().catch(() => ({}));

  // 실패(인증/발신번호 등) 응답
  if (!res.ok) {
    const msg =
      (data?.errorMessage as string) ||
      (data?.message as string) ||
      `발송 실패(HTTP ${res.status})`;
    return { ok: false, total: messages.length, success: 0, failed: messages.length, message: msg };
  }

  const count = data?.groupInfo?.count ?? {};
  const total = Number(count.total ?? messages.length);
  const failed = Number(count.registeredFailed ?? (data?.failedMessageList?.length ?? 0));
  const success = Math.max(0, total - failed);
  const firstErr = data?.failedMessageList?.[0]?.statusMessage as string | undefined;
  return {
    ok: failed === 0,
    total,
    success,
    failed,
    message: failed === 0 ? "발송 접수 완료" : firstErr || "일부 발송 실패",
    groupId: data?.groupInfo?.groupId,
  };
}

export interface SolapiBalance {
  ok: boolean;
  balance: number;
  point: number;
  message?: string;
}

/** 잔액(캐시/포인트) 조회 — 인증 확인 겸용 */
export async function solapiBalance(): Promise<SolapiBalance> {
  const res = await fetch(`${SOLAPI_BASE}/cash/v1/balance`, {
    headers: { Authorization: authHeader() },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, balance: 0, point: 0, message: (data?.errorMessage as string) || `조회 실패` };
  }
  return { ok: true, balance: Number(data?.balance ?? 0), point: Number(data?.point ?? 0) };
}

export interface SolapiPricing {
  /** 단문(90byte 이하) 1건 단가(원) */
  sms: number;
  /** 장문 1건 단가(원) */
  lms: number;
  /** 이미지(MMS) 1건 단가(원) */
  mms: number;
}

/**
 * 이 계정의 실제 발송 단가 조회 (국내, MT 기준).
 * 발송 전 '예상 지출 금액' 계산에 쓴다. 실패하면 null.
 */
export async function solapiPricing(): Promise<SolapiPricing | null> {
  try {
    const res = await fetch(`${SOLAPI_BASE}/pricing/v1/messaging`, {
      headers: { Authorization: authHeader() },
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data) return null;
    const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const out = { sms: num(data.sms), lms: num(data.lms), mms: num(data.mms) };
    return out.sms > 0 ? out : null;
  } catch {
    return null;
  }
}
