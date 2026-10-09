"use client";

import { useEffect, useRef, useState } from "react";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";

/**
 * 토스페이먼츠 **결제위젯** — CRM 이용권(SaaS 구독) 결제용.
 *
 * 포트원(`app/pay/[orderUid]/PayClient.tsx`)과 다른 점:
 *   · 결제수단·약관동의 UI 를 **위젯이 페이지 안에 직접 그린다**
 *     → 포트원 때 직접 만든 동의 체크박스가 여기서는 필요 없다(위젯이 renderAgreement 로 그린다)
 *   · 승인 모델이 다르다. 토스는 결제창에서 돌아온 뒤 **우리가 승인 API 를 호출해야**
 *     실제로 결제된다. 이 화면을 벗어났다고 돈이 빠진 게 아니다.
 *
 * 🚨 `variantKey` 는 넘기지 않는다. 결제 UI 를 여러 개 만들었을 때 고르는 선택값인데,
 *    상점에 그 이름의 UI 가 없으면 렌더링이 **통째로 실패**한다(INVALID_VARIANT_KEY).
 *    기본 UI 를 쓰면 생략이 맞다. (2026-10-02 에 실제로 겪은 일)
 *
 * 🚨 키는 반드시 **결제위젯 종류(gck/gsk)** 여야 한다. 일반결제 키(ck/sk)를 넣으면
 *    결제창이 아예 뜨지 않는다. 서버에서 tossKeysMatch() 로 미리 거른다.
 *
 * 금액은 **부모가 서버에서 받아 내려준 값**만 쓴다. 여기서 금액을 만들거나 고치는
 * 코드가 생기면 그 순간 위변조 경로가 열린다.
 */
export default function TossPayClient(props: {
  orderUid: string;
  token: string;
  amount: number;
  orderName: string;
  customerName: string;
  customerEmail?: string;
  /** 회원별로 항상 같은 값이어야 한다 — 토스 위젯 요구사항 */
  customerKey: string;
  clientKey: string;
  /** 약관·정책 링크 */
  policyHref?: string;
}) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const widgetsRef = useRef<unknown>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const toss = await loadTossPayments(props.clientKey);
        const widgets = toss.widgets({ customerKey: props.customerKey });
        if (!alive) return;
        widgetsRef.current = widgets;

        await widgets.setAmount({ currency: "KRW", value: props.amount });
        await Promise.all([
          widgets.renderPaymentMethods({ selector: "#toss-payment-method" }),
          widgets.renderAgreement({ selector: "#toss-agreement" }),
        ]);
        if (alive) setReady(true);
      } catch (e) {
        /* 실패 원인을 숨기지 않는다 — 결제창이 안 뜨는 이유는 대부분 상점 설정이고,
           코드를 봐야 어디를 고칠지 알 수 있다.
           (NOT_REGISTERED_PAYMENT_WIDGET = 상점관리자에 결제 UI 가 없음) */
        const code = (e as { code?: string })?.code ?? "";
        const msg = e instanceof Error ? e.message : "결제창을 불러오지 못했어요";
        console.error("[toss] 결제위젯 렌더 실패", code, e);
        if (alive) setError(code ? `${msg} (${code})` : msg);
      }
    })();
    return () => {
      alive = false;
    };
  }, [props.clientKey, props.customerKey, props.amount]);

  async function pay() {
    const widgets = widgetsRef.current as {
      requestPayment: (o: Record<string, unknown>) => Promise<void>;
    } | null;
    if (!widgets || busy) return;
    setBusy(true);
    setError(null);

    const base = `${window.location.origin}/billing/pay/${props.orderUid}/done`;
    const q = `t=${encodeURIComponent(props.token)}`;
    try {
      await widgets.requestPayment({
        orderId: props.orderUid,
        orderName: props.orderName,
        successUrl: `${base}?${q}`,
        failUrl: `${base}?${q}`,
        customerName: props.customerName || undefined,
        customerEmail: props.customerEmail || undefined,
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
      {/* 결제수단·약관동의는 위젯이 이 두 자리에 직접 그린다 */}
      <div id="toss-payment-method" />
      <div id="toss-agreement" className="mt-2" />

      {props.policyHref && (
        <p className="mt-2 text-center text-xs text-gray-400">
          <a
            href={props.policyHref}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-blue-600 underline"
          >
            서비스 제공기간 · 취소 · 환불 규정 보기
          </a>
        </p>
      )}

      {error && (
        <div className="mt-3 rounded-lg bg-red-50 px-3.5 py-3 text-sm leading-relaxed text-red-700">
          <p className="font-semibold">결제창을 불러오지 못했어요</p>
          <p className="mt-1 break-all text-[13px]">{error}</p>
          <p className="mt-2 text-[12.5px] text-red-600/80">
            잠시 후 다시 시도해 주세요. 계속 같은 화면이면 문의해 주세요.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={pay}
        disabled={!ready || busy}
        className="mt-5 w-full rounded-xl bg-blue-600 py-4 text-base font-bold text-white disabled:bg-gray-300"
      >
        {!ready ? "결제 준비 중…" : busy ? "결제창을 여는 중…" : `${props.amount.toLocaleString()}원 결제하기`}
      </button>
    </div>
  );
}
