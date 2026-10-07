import "server-only";

/**
 * 포트원(PortOne) **V1** 연동 — KG이니시스 결제창 일반결제.
 *
 * 🚨 토스와 승인 모델이 다르다. 이걸 혼동하면 돈 사고가 난다.
 *   토스   : 결제창 → paymentKey → **우리가 승인 API 를 호출**해야 실제 결제됨.
 *            승인 전에 금액이 틀리면 그냥 거절하면 되고 돈은 움직이지 않는다.
 *   포트원 : 결제창에서 **이미 승인까지 끝난 뒤** imp_uid 가 돌아온다.
 *            우리가 하는 건 '승인'이 아니라 **검증**이다.
 *            금액이 틀렸다면 돈은 이미 빠져나갔으므로 **즉시 취소**해야 한다.
 *            → verifyPortonePayment() 가 불일치 시 자동 취소까지 책임진다.
 *
 * 키 (포트원 콘솔 > 결제 연동 > 식별코드·API Keys 의 **V1 탭**):
 *   NEXT_PUBLIC_PORTONE_IMP_CODE     가맹점 식별코드 (imp……) — 결제창 IMP.init 용, 공개값
 *   NEXT_PUBLIC_PORTONE_CHANNEL_KEY  채널 키 (channel-key-……) — 어느 PG·어느 모드로 결제할지, 공개값
 *   PORTONE_IMP_KEY                  REST API Key    (서버 전용)
 *   PORTONE_IMP_SECRET               REST API Secret (서버 전용)
 *   PORTONE_LIVE=1                   이 채널이 **실연동**임을 명시. 온라인 판매 마스터 스위치가 이걸 본다.
 *
 * 🚨 채널 키는 테스트/실연동이 **다르다**. 실연동으로 바꿀 때 PORTONE_LIVE 도 같이 켜야 한다.
 *    (토스에서 결제 UI 를 테스트에만 등록해 운영 결제창이 안 떴던 사고와 같은 종류)
 */

const API = "https://api.iamport.kr";

export function portoneImpCode(): string {
  return process.env.NEXT_PUBLIC_PORTONE_IMP_CODE || "";
}

export function portoneChannelKey(): string {
  return process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY || "";
}

/** 결제창을 띄울 수 있는 상태인지 — 하나라도 비면 결제 페이지가 안내를 띄운다 */
export function portoneConfigured(): boolean {
  return !!(
    portoneImpCode() &&
    portoneChannelKey() &&
    process.env.PORTONE_IMP_KEY &&
    process.env.PORTONE_IMP_SECRET
  );
}

/** 실연동 채널인지. 테스트 채널로 도는 중이면 false → 온라인 판매는 열리지 않는다 */
export function portoneIsLive(): boolean {
  return process.env.PORTONE_LIVE === "1";
}

/* ── 액세스 토큰 ───────────────────────────────────────────
   유효기간 30분. 매 요청마다 발급하면 호출이 두 배가 되므로 메모리에 캐시한다.
   만료 1분 전에 버려서 경계에서 401 이 나지 않게 한다. */
let tokenCache: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<{ ok: boolean; token?: string; error?: string }> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return { ok: true, token: tokenCache.token };
  }
  const imp_key = process.env.PORTONE_IMP_KEY;
  const imp_secret = process.env.PORTONE_IMP_SECRET;
  if (!imp_key || !imp_secret) return { ok: false, error: "포트원 API 키가 설정되지 않았습니다" };

  try {
    const res = await fetch(`${API}/users/getToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imp_key, imp_secret }),
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    const json = (await res.json()) as {
      code?: number;
      message?: string;
      response?: { access_token?: string; expired_at?: number; now?: number };
    };
    const token = json.response?.access_token;
    if (!res.ok || json.code !== 0 || !token) {
      return { ok: false, error: String(json.message ?? `토큰 발급 실패 (${res.status})`) };
    }
    // expired_at/now 는 서버 기준 unix 초 — 남은 시간만 가져와 우리 시계로 환산한다
    const ttlSec = Math.max(60, Number(json.response?.expired_at ?? 0) - Number(json.response?.now ?? 0));
    tokenCache = { token, expiresAt: Date.now() + (ttlSec - 60) * 1000 };
    return { ok: true, token };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "포트원 통신 실패" };
  }
}

/** 포트원 V1 결제 객체 (쓰는 필드만) */
export interface PortonePayment {
  imp_uid: string;
  merchant_uid: string;
  status: "ready" | "paid" | "cancelled" | "failed" | string;
  amount: number;
  cancel_amount: number;
  pay_method?: string;
  pg_provider?: string;
  pg_tid?: string;
  name?: string;
  receipt_url?: string;
  paid_at?: number;
  cancelled_at?: number;
  fail_reason?: string;
  cancel_reason?: string;
  card_name?: string;
  cancel_history?: {
    pg_tid?: string;
    amount?: number;
    cancelled_at?: number;
    reason?: string;
  }[];
  [k: string]: unknown;
}

/**
 * 결제 단건 조회. **웹훅 본문도 결제창 응답도 믿지 않고** 항상 이걸로 확인한다.
 * 웹훅은 누구나 흉내낼 수 있고, 결제창 응답은 사용자 브라우저를 거쳐 온다.
 */
export async function fetchPortonePayment(
  impUid: string
): Promise<{ ok: boolean; pay?: PortonePayment; error?: string }> {
  const t = await accessToken();
  if (!t.ok || !t.token) return { ok: false, error: t.error };
  try {
    const res = await fetch(`${API}/payments/${encodeURIComponent(impUid)}`, {
      headers: { Authorization: `Bearer ${t.token}` },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    const json = (await res.json()) as { code?: number; message?: string; response?: PortonePayment };
    if (!res.ok || json.code !== 0 || !json.response) {
      return { ok: false, error: String(json.message ?? `결제 조회 실패 (${res.status})`) };
    }
    return { ok: true, pay: json.response };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "포트원 통신 실패" };
  }
}

/** 주문번호(merchant_uid)로 조회 — 웹훅이 imp_uid 를 주지 않는 예외 상황용 */
export async function fetchPortonePaymentByOrderUid(
  orderUid: string
): Promise<{ ok: boolean; pay?: PortonePayment; error?: string }> {
  const t = await accessToken();
  if (!t.ok || !t.token) return { ok: false, error: t.error };
  try {
    const res = await fetch(
      `${API}/payments/find/${encodeURIComponent(orderUid)}`,
      {
        headers: { Authorization: `Bearer ${t.token}` },
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      }
    );
    const json = (await res.json()) as { code?: number; message?: string; response?: PortonePayment };
    if (!res.ok || json.code !== 0 || !json.response) {
      return { ok: false, error: String(json.message ?? `결제 조회 실패 (${res.status})`) };
    }
    return { ok: true, pay: json.response };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "포트원 통신 실패" };
  }
}

/**
 * 결제 취소(환불). amountWon 을 주면 부분 취소.
 *
 * 🚨 이니시스는 취소에 **INIAPI KEY · INIAPI IV** 가 채널에 등록돼 있어야 한다.
 *    없으면 여기서 실패한다 — 실연동 전에 반드시 받아 채널에 넣을 것.
 */
export async function cancelPortonePayment(opts: {
  impUid: string;
  reason: string;
  amountWon?: number;
}): Promise<{ ok: boolean; pay?: PortonePayment; error?: string }> {
  const t = await accessToken();
  if (!t.ok || !t.token) return { ok: false, error: t.error };
  try {
    const res = await fetch(`${API}/payments/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${t.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        imp_uid: opts.impUid,
        reason: opts.reason,
        ...(opts.amountWon ? { amount: opts.amountWon } : {}),
      }),
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    });
    const json = (await res.json()) as { code?: number; message?: string; response?: PortonePayment };
    if (!res.ok || json.code !== 0) {
      return { ok: false, error: String(json.message ?? `취소 실패 (${res.status})`) };
    }
    return { ok: true, pay: json.response };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "포트원 통신 실패" };
  }
}

export interface PortoneVerifyResult {
  ok: boolean;
  amount?: number;
  impUid?: string;
  orderUid?: string;
  method?: string;
  approvedAt?: string;
  receiptUrl?: string;
  raw?: PortonePayment;
  error?: string;
  code?: string;
  /** 검증 실패로 우리가 결제를 되돌렸는지 (회원에게 '취소됐다'고 알려야 한다) */
  autoCanceled?: boolean;
}

/** unix 초 → ISO. 0·undefined 면 null */
function tsToIso(sec: number | undefined | null): string | null {
  const n = Number(sec ?? 0);
  return n > 0 ? new Date(n * 1000).toISOString() : null;
}

/**
 * 결제 검증 — 발급 전에 반드시 통과해야 하는 관문.
 *
 * 세 가지를 본다. 하나라도 어긋나면 **이미 받은 돈을 즉시 돌려주고** 실패로 답한다.
 *   1) status === 'paid'      실제로 결제가 끝났는가
 *   2) merchant_uid 일치      다른 주문의 결제를 가져다 붙이지 못하게
 *   3) amount 일치            서버가 확정한 금액과 같은가 (위변조·우리 계산 오류)
 *
 * @param amountWon 주문에 저장된 서버 확정 금액. 클라이언트가 보낸 값을 쓰면 안 된다.
 */
export async function verifyPortonePayment(opts: {
  impUid: string;
  orderUid: string;
  amountWon: number;
}): Promise<PortoneVerifyResult> {
  const look = await fetchPortonePayment(opts.impUid);
  if (!look.ok || !look.pay) {
    return { ok: false, error: look.error ?? "결제 정보를 확인할 수 없습니다", code: "LOOKUP_FAILED" };
  }
  const pay = look.pay;

  // 결제가 끝나지 않았다 — 돈이 안 빠졌으니 취소할 것도 없다
  if (pay.status !== "paid") {
    const why =
      pay.status === "failed"
        ? pay.fail_reason || "결제가 실패했습니다"
        : pay.status === "cancelled"
          ? "이미 취소된 결제입니다"
          : `결제가 완료되지 않았습니다 (${pay.status})`;
    return { ok: false, error: why, code: `STATUS_${pay.status}`, raw: pay };
  }

  /* 여기부터는 **돈이 이미 빠져나간 상태**다. 어긋나면 되돌려야 한다. */
  const mismatch =
    pay.merchant_uid !== opts.orderUid
      ? { code: "ORDER_MISMATCH", msg: "결제 정보가 주문과 일치하지 않습니다" }
      : Number(pay.amount) !== Number(opts.amountWon)
        ? { code: "AMOUNT_MISMATCH", msg: "결제 금액이 주문 금액과 다릅니다" }
        : null;

  if (mismatch) {
    const undo = await cancelPortonePayment({
      impUid: opts.impUid,
      reason: `검증 실패 자동 취소 (${mismatch.code})`,
    });
    return {
      ok: false,
      error: undo.ok
        ? `${mismatch.msg} 결제는 자동으로 취소했습니다.`
        : `${mismatch.msg} 자동 취소에 실패했습니다 — 센터로 즉시 문의해주세요.`,
      code: mismatch.code,
      autoCanceled: undo.ok,
      raw: pay,
    };
  }

  return {
    ok: true,
    amount: Number(pay.amount),
    impUid: pay.imp_uid,
    orderUid: pay.merchant_uid,
    method: pay.card_name || pay.pay_method || "",
    approvedAt: tsToIso(pay.paid_at) ?? new Date().toISOString(),
    receiptUrl: pay.receipt_url || "",
    raw: pay,
  };
}

/**
 * 결제 객체에서 **취소 상태**만 뽑아 공통 모양으로 바꾼다.
 *
 * 🚨 토스와 모양이 전혀 다르다:
 *   토스   전액취소 status=CANCELED / 부분취소 status=PARTIAL_CANCELED, 내역은 cancels[]
 *   포트원 전액취소 status=cancelled / **부분취소는 status 가 paid 그대로**이고
 *          cancel_amount 만 늘어난다 → status 만 보면 부분취소를 통째로 놓친다.
 */
export function portoneCancelState(pay: PortonePayment): {
  canceled: boolean;
  isPartial: boolean;
  canceledAmountWon: number;
  refundedAt: string;
  reason: string;
  txKey: string | null;
} {
  const total = Number(pay.amount ?? 0);
  const canceledAmount = Number(pay.cancel_amount ?? 0);
  const canceled = pay.status === "cancelled" || canceledAmount > 0;
  const history = Array.isArray(pay.cancel_history) ? pay.cancel_history : [];
  const latest = history[history.length - 1];
  return {
    canceled,
    isPartial: canceled && canceledAmount > 0 && canceledAmount < total,
    canceledAmountWon: canceledAmount,
    refundedAt:
      tsToIso(latest?.cancelled_at) ?? tsToIso(pay.cancelled_at) ?? new Date().toISOString(),
    reason: latest?.reason || pay.cancel_reason || "PG 에서 취소됨",
    txKey: latest?.pg_tid || pay.pg_tid || null,
  };
}
