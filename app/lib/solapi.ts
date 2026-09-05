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
 * 실제 캐시 차감액 / API 표시 단가 비율.
 *
 * 2026-09-06 실측: API 가 알려주는 단가에서 정확히 1% 낮은 금액이 캐시에서 빠진다.
 *   SMS 표시 18원  → 캐시 차감 17.82원 (18 × 0.99)
 *   LMS 표시 45원  → 캐시 차감 44.55원 (45 × 0.99)
 * 화면의 '캐시 잔액'과 같은 기준으로 보여주기 위해 이 비율을 적용한다.
 */
const CASH_DEDUCTION_RATE = 0.99;

/**
 * 발송 1건당 실제 캐시 차감액(원) — '예상 지출 금액' 계산용.
 *
 * 1순위: 환경변수 SOLAPI_PRICE_SMS / _LMS / _MMS (실차감액을 직접 지정. 비율 미적용)
 * 2순위: 솔라피 API 조회값 × CASH_DEDUCTION_RATE
 * 둘 다 없으면 null → 화면에서 금액 표시를 숨긴다.
 */
export async function solapiPricing(): Promise<(SolapiPricing & { source: "env" | "api" }) | null> {
  const envNum = (k: string) => {
    const v = Number(process.env[k]);
    return Number.isFinite(v) && v > 0 ? v : 0;
  };
  const envSms = envNum("SOLAPI_PRICE_SMS");
  if (envSms > 0) {
    return {
      sms: envSms,
      lms: envNum("SOLAPI_PRICE_LMS") || envSms * 2.5,
      mms: envNum("SOLAPI_PRICE_MMS") || envSms * 6,
      source: "env",
    };
  }
  try {
    const res = await fetch(`${SOLAPI_BASE}/pricing/v1/messaging`, {
      headers: { Authorization: authHeader() },
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data) return null;
    const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const round2 = (n: number) => Math.round(n * CASH_DEDUCTION_RATE * 100) / 100;
    const out = {
      sms: round2(num(data.sms)),
      lms: round2(num(data.lms)),
      mms: round2(num(data.mms)),
      source: "api" as const,
    };
    return out.sms > 0 ? out : null;
  } catch {
    return null;
  }
}
