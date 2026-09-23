"use client";

import { useEffect, useRef, useState } from "react";

type Phase = "confirming" | "done" | "failed";

/** 회원앱 딥링크 스킴 — 시스템 브라우저에서 앱으로 되돌아가는 주소 */
const APP_RETURN_SCHEME = "moducmmember://pay-done";

/**
 * 회원앱에 결과를 알린다.
 *  · 시스템 브라우저(expo-web-browser)로 열렸으면 딥링크로 복귀 → 앱이 창을 닫는다
 *  · WebView 로 열렸으면 postMessage (앞으로 쓸 일은 없지만 남겨둔다)
 */
function notifyApp(payload: { ok: boolean; [k: string]: unknown }, returnToApp?: boolean) {
  try {
    const w = window as unknown as { ReactNativeWebView?: { postMessage: (s: string) => void } };
    w.ReactNativeWebView?.postMessage(JSON.stringify(payload));
  } catch {
    /* 웹 브라우저면 무시 */
  }
  if (returnToApp) {
    // 결과 화면을 잠깐 보여준 뒤 앱으로 — 바로 닫으면 뭐가 됐는지 못 본다
    setTimeout(() => {
      window.location.href = `${APP_RETURN_SCHEME}?ok=${payload.ok ? 1 : 0}`;
    }, 1200);
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
  /** 회원앱이 시스템 브라우저로 연 결제인지 — 끝나면 딥링크로 앱에 돌려준다 */
  returnToApp?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>(props.paymentKey ? "confirming" : "failed");
  const [message, setMessage] = useState(props.failMessage || "결제가 취소됐어요");
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (!props.paymentKey) {
      notifyApp({ type: "payment", ok: false, reason: props.failCode || "canceled" }, props.returnToApp);
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
          notifyApp({ type: "payment", ok: false, reason: data?.error }, props.returnToApp);
          return;
        }
        setPhase("done");
        setReceiptUrl(data?.receiptUrl ?? null);
        notifyApp(
          { type: "payment", ok: true, orderId: data?.orderId, issued: data?.issued },
          props.returnToApp
        );
      } catch {
        setPhase("failed");
        setMessage("네트워크 오류로 결제 확인을 못 했어요. 잠시 후 주문 내역을 확인해주세요.");
        notifyApp({ type: "payment", ok: false, reason: "network" }, props.returnToApp);
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
