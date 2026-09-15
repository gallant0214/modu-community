/**
 * 토스페이먼츠 연동 (일회성 결제).
 *
 * 원칙: **앱이 "결제됐다"고 말하는 걸 믿지 않는다.**
 * 앱은 paymentKey 만 전달하고, 승인·금액 확인은 서버가 토스 서버에 직접 물어본다.
 *
 * 키:
 *   TOSS_SECRET_KEY       서버 전용 (절대 앱으로 내려보내지 않는다)
 *   NEXT_PUBLIC_TOSS_CLIENT_KEY  앱/웹 결제창용 (공개되어도 되는 키)
 * 미설정이면 토스 공개 테스트 키로 동작한다 → PG 계약 전에도 전 과정을 시험할 수 있다.
 */

const TEST_SECRET = "test_sk_zXLkKEypNArWmo50nX3lmeaxYG5R";
const TEST_CLIENT = "test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq";

export function tossSecretKey(): string {
  return process.env.TOSS_SECRET_KEY || TEST_SECRET;
}

export function tossClientKey(): string {
  return process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || TEST_CLIENT;
}

/** 실제 계약 키가 설정돼 있는지 (테스트 키로 도는 중이면 false) */
export function tossIsLive(): boolean {
  const k = process.env.TOSS_SECRET_KEY;
  return !!k && !k.startsWith("test_");
}

export interface TossConfirmResult {
  ok: boolean;
  /** 토스가 확인해 준 실제 결제 금액 */
  amount?: number;
  paymentKey?: string;
  orderId?: string;
  method?: string;
  approvedAt?: string;
  receiptUrl?: string;
  raw?: unknown;
  error?: string;
  code?: string;
}

/**
 * 결제 승인. 토스가 200 을 주고 status=DONE 일 때만 성공으로 본다.
 * @param amount 서버가 계산한 금액 — 토스에 그대로 넘겨 금액 위변조를 막는다
 */
export async function confirmTossPayment(opts: {
  paymentKey: string;
  orderId: string;
  amount: number;
}): Promise<TossConfirmResult> {
  const auth = Buffer.from(`${tossSecretKey()}:`).toString("base64");
  try {
    const res = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        // 같은 주문을 두 번 승인 요청해도 한 번만 처리되도록
        "Idempotency-Key": `confirm-${opts.orderId}`,
      },
      body: JSON.stringify({
        paymentKey: opts.paymentKey,
        orderId: opts.orderId,
        amount: opts.amount,
      }),
      signal: AbortSignal.timeout(20000),
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        error: String(json.message ?? "결제 승인에 실패했습니다"),
        code: String(json.code ?? res.status),
        raw: json,
      };
    }
    if (String(json.status) !== "DONE") {
      return { ok: false, error: `결제가 완료되지 않았습니다 (${json.status})`, raw: json };
    }
    const approvedAmount = Number((json.totalAmount as number) ?? 0);
    if (approvedAmount !== opts.amount) {
      // 여기 걸리면 위변조 시도이거나 우리 계산이 틀린 것 — 발급하지 않는다
      return {
        ok: false,
        error: "결제 금액이 주문 금액과 다릅니다",
        code: "AMOUNT_MISMATCH",
        raw: json,
      };
    }
    return {
      ok: true,
      amount: approvedAmount,
      paymentKey: String(json.paymentKey ?? ""),
      orderId: String(json.orderId ?? ""),
      method: String(json.method ?? ""),
      approvedAt: String(json.approvedAt ?? ""),
      receiptUrl: String(
        (json.receipt as Record<string, unknown> | undefined)?.url ?? ""
      ),
      raw: json,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "결제 서버 통신 실패" };
  }
}

/** 결제 취소(환불). cancelAmount 를 주면 부분 취소. */
export async function cancelTossPayment(opts: {
  paymentKey: string;
  reason: string;
  cancelAmount?: number;
}): Promise<{ ok: boolean; error?: string; raw?: unknown }> {
  const auth = Buffer.from(`${tossSecretKey()}:`).toString("base64");
  try {
    const res = await fetch(
      `https://api.tosspayments.com/v1/payments/${encodeURIComponent(opts.paymentKey)}/cancel`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `cancel-${opts.paymentKey}-${opts.cancelAmount ?? "all"}`,
        },
        body: JSON.stringify({
          cancelReason: opts.reason,
          ...(opts.cancelAmount ? { cancelAmount: opts.cancelAmount } : {}),
        }),
        signal: AbortSignal.timeout(20000),
      }
    );
    const json = await res.json();
    if (!res.ok) {
      return { ok: false, error: String(json?.message ?? "취소 실패"), raw: json };
    }
    return { ok: true, raw: json };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "결제 서버 통신 실패" };
  }
}
