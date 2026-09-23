"use client";

import { useEffect, useRef, useState } from "react";

type Phase = "confirming" | "done" | "failed";

/** 회원앱 WebView 에 결과를 알린다 — 앱이 창을 닫고 보유 이용권을 새로고침하도록 */
function notifyApp(payload: Record<string, unknown>) {
  try {
    const w = window as unknown as { ReactNativeWebView?: { postMessage: (s: string) => void } };
    w.ReactNativeWebView?.postMessage(JSON.stringify(payload));
  } catch {
    /* 웹 브라우저면 무시 */
  }
}

export default function DoneClient(props: {
  orderUid: string;
  token: string;
  centerId: number;
  paymentKey: string;
  amount: number;
  failCode: string;
  failMessage: string;
}) {
  const [phase, setPhase] = useState<Phase>(props.paymentKey ? "confirming" : "failed");
  const [message, setMessage] = useState(props.failMessage || "결제가 취소됐어요");
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (!props.paymentKey) {
      notifyApp({ type: "payment", ok: false, reason: props.failCode || "canceled" });
      return;
    }
    if (ran.current) return; // StrictMode 이중 실행 방지 (승인은 한 번만)
    ran.current = true;

    (async () => {
      try {
        const res = await fetch("/api/crm/member-app/orders/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            centerId: props.centerId,
            orderUid: props.orderUid,
            paymentKey: props.paymentKey,
            amount: props.amount,
            token: props.token,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setPhase("failed");
          setMessage(data?.error || "결제 승인에 실패했어요");
          notifyApp({ type: "payment", ok: false, reason: data?.error });
          return;
        }
        setPhase("done");
        setReceiptUrl(data?.receiptUrl ?? null);
        notifyApp({ type: "payment", ok: true, orderId: data?.orderId, issued: data?.issued });
      } catch {
        setPhase("failed");
        setMessage("네트워크 오류로 결제 확인을 못 했어요. 잠시 후 주문 내역을 확인해주세요.");
        notifyApp({ type: "payment", ok: false, reason: "network" });
      }
    })();
  }, [props]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center px-6 text-center">
      {phase === "confirming" && (
        <>
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
          <p className="mt-5 text-base font-semibold text-gray-900">결제를 확인하고 있어요</p>
          <p className="mt-1 text-sm text-gray-500">창을 닫지 말고 잠시만 기다려주세요</p>
        </>
      )}

      {phase === "done" && (
        <>
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-3xl">
            ✓
          </div>
          <p className="mt-5 text-lg font-bold text-gray-900">결제가 완료됐어요</p>
          <p className="mt-1 text-sm text-gray-500">이용권이 바로 등록됐습니다</p>
          {receiptUrl && (
            <a
              href={receiptUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-6 text-sm font-semibold text-blue-600 underline"
            >
              영수증 보기
            </a>
          )}
        </>
      )}

      {phase === "failed" && (
        <>
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-3xl">
            !
          </div>
          <p className="mt-5 text-lg font-bold text-gray-900">결제를 완료하지 못했어요</p>
          <p className="mt-2 text-sm text-gray-500">{message}</p>
          <p className="mt-4 text-xs text-gray-400">
            결제된 금액이 있다면 자동으로 취소됩니다. 문제가 계속되면 센터로 문의해주세요.
          </p>
        </>
      )}
    </main>
  );
}
