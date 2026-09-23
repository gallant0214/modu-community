"use client";

import { useEffect, useRef, useState } from "react";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";

/**
 * 토스 결제위젯. 금액은 **부모가 서버에서 받아 내려준 값**만 쓴다.
 * 여기서 금액을 계산하거나 고치는 코드가 생기면 그 순간 위변조 경로가 열린다.
 */
export default function PayClient(props: {
  orderUid: string;
  token: string;
  centerId: number;
  amount: number;
  orderName: string;
  customerName: string;
  customerKey: string;
  clientKey: string;
}) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const widgetsRef = useRef<Awaited<ReturnType<typeof loadTossPayments>> extends infer T
    ? T extends { widgets: (o: { customerKey: string }) => infer W }
      ? W
      : never
    : never>(null as never);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const toss = await loadTossPayments(props.clientKey);
        const widgets = toss.widgets({ customerKey: props.customerKey });
        if (!alive) return;
        widgetsRef.current = widgets as never;

        await widgets.setAmount({ currency: "KRW", value: props.amount });
        await Promise.all([
          widgets.renderPaymentMethods({ selector: "#toss-payment-method", variantKey: "DEFAULT" }),
          widgets.renderAgreement({ selector: "#toss-agreement", variantKey: "AGREEMENT" }),
        ]);
        if (alive) setReady(true);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "결제창을 불러오지 못했어요");
      }
    })();
    return () => {
      alive = false;
    };
  }, [props.clientKey, props.customerKey, props.amount]);

  async function pay() {
    const widgets = widgetsRef.current as unknown as {
      requestPayment: (o: Record<string, unknown>) => Promise<void>;
    } | null;
    if (!widgets || busy) return;
    setBusy(true);
    setError(null);

    const base = `${window.location.origin}/pay/${props.orderUid}/done`;
    const q = `t=${encodeURIComponent(props.token)}&centerId=${props.centerId}`;
    try {
      await widgets.requestPayment({
        orderId: props.orderUid,
        orderName: props.orderName,
        successUrl: `${base}?${q}`,
        failUrl: `${base}?${q}`,
        customerName: props.customerName || undefined,
      });
    } catch (e) {
      // 사용자가 결제창을 닫은 경우도 여기로 온다 — 에러로 취급하지 않는다
      const msg = e instanceof Error ? e.message : "";
      if (msg && !/취소|cancel/i.test(msg)) setError(msg);
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      <div id="toss-payment-method" />
      <div id="toss-agreement" className="mt-2" />

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      <button
        type="button"
        onClick={pay}
        disabled={!ready || busy}
        className="mt-5 w-full rounded-xl bg-blue-600 py-4 text-base font-bold text-white disabled:bg-gray-300"
      >
        {busy ? "결제창을 여는 중…" : `${props.amount.toLocaleString()}원 결제하기`}
      </button>
    </div>
  );
}
