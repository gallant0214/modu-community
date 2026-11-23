"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { safeReturnPath } from "@/app/lib/safe-return-to";

/**
 * 모바일 온누리상품권 현장 결제 — 결제 화면(홈페이지·회원앱·QR 셀프가입 공용).
 *
 * 온누리는 PG 결제창이 없다. 회원이 **카운터에 붙은 가맹점 QR** 을 온누리 앱으로 찍어 결제하면
 * 카운터 공기계가 가맹점 앱 알림을 서버로 보내고, 서버가 금액·시각으로 이 주문을 찾아 발급한다.
 * 못 맞추면 직원이 확인하고, 그동안 회원은 임시로 입장할 수 있다.
 *
 * 금액은 서버가 내려준 주문 금액만 보여준다(여기서 만들거나 고치지 않는다).
 */
type Phase = "choose" | "waiting" | "claimed" | "paid" | "expired";

const APP_RETURN_SCHEME = "moducmmember://pay-done";

export default function OnnuriPayClient(props: {
  orderUid: string;
  token: string;
  amount: number;
  productName: string;
  /** 주문에 이미 저장된 온누리 진행 상태 (다시 연 경우) */
  initialState: string | null;
  /** 카드 결제 영역 — 온누리를 고르기 전에는 이걸 보여준다 */
  cardPay: ReactNode;
  policyHref?: string;
  returnToApp?: boolean;
  returnTo?: string;
}) {
  const [phase, setPhase] = useState<Phase>(
    props.initialState === "claimed" ? "claimed" : props.initialState === "waiting" ? "waiting" : "choose"
  );
  const [showCard, setShowCard] = useState(props.initialState !== "waiting" && props.initialState !== "claimed");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const doneRef = useRef(false);

  const post = useCallback(
    async (action: "start" | "claim") => {
      const res = await fetch("/api/crm/member-app/orders/onnuri", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderUid: props.orderUid, t: props.token, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "요청을 처리하지 못했어요");
      return data as { ok: boolean; matched?: boolean };
    },
    [props.orderUid, props.token]
  );

  const finishPaid = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setPhase("paid");
    if (props.returnToApp) {
      setTimeout(() => {
        window.location.href = `${APP_RETURN_SCHEME}?ok=1`;
      }, 1500);
      return;
    }
    const back = safeReturnPath(props.returnTo);
    if (back) setTimeout(() => window.location.replace(back), 1500);
  }, [props.returnToApp, props.returnTo]);

  /* '결제했어요' 이후 — 몇 초마다 확인해서 발급되면 완료 화면으로 */
  useEffect(() => {
    if (phase !== "claimed" && phase !== "waiting") return;
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(
          `/api/crm/member-app/orders/onnuri?orderUid=${encodeURIComponent(props.orderUid)}&t=${encodeURIComponent(props.token)}`,
          { cache: "no-store" }
        );
        if (res.status === 401) {
          // 결제 링크 시간(35분)이 지났다 — 확인되면 앱 알림으로 알려준다
          if (!stop && phase === "claimed") setPhase("expired");
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (stop) return;
        if (data?.paid) finishPaid();
        else if (data?.status && data.status !== "pending") {
          setError("주문이 종료됐어요. 센터에 문의해 주세요.");
        }
      } catch {
        /* 잠깐 끊겨도 다음 번에 다시 본다 */
      }
    };
    tick();
    const t = setInterval(tick, phase === "claimed" ? 3000 : 6000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [phase, props.orderUid, props.token, finishPaid]);

  const start = async () => {
    setBusy(true);
    setError("");
    try {
      await post("start");
      setPhase("waiting");
      setShowCard(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청을 처리하지 못했어요");
    } finally {
      setBusy(false);
    }
  };

  const claim = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await post("claim");
      if (r.matched) finishPaid();
      else setPhase("claimed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청을 처리하지 못했어요");
    } finally {
      setBusy(false);
    }
  };

  const won = `${props.amount.toLocaleString()}원`;

  /* ── 완료 ── */
  if (phase === "paid") {
    return (
      <section className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
        <p className="text-lg font-bold text-emerald-800">결제가 확인됐어요</p>
        <p className="mt-1.5 text-sm text-emerald-700">
          {props.productName} 이용권이 발급됐어요. 바로 출석하실 수 있어요.
        </p>
      </section>
    );
  }

  /* ── 온누리 진행 중 ── */
  if (phase === "waiting" || phase === "claimed" || phase === "expired") {
    return (
      <section className="mt-6">
        <div className="rounded-xl border-2 border-emerald-500 p-5">
          <p className="text-sm font-bold text-emerald-700">모바일 온누리상품권 결제</p>
          <p className="mt-2 text-[28px] font-extrabold text-gray-900 tabular-nums">{won}</p>

          {phase === "waiting" ? (
            <>
              <ol className="mt-4 space-y-2.5 text-[14px] leading-relaxed text-gray-700">
                <li><b>1.</b> 휴대폰에서 <b>온누리상품권 앱</b>을 열어 주세요</li>
                <li><b>2.</b> <b>카운터에 붙어 있는 가맹점 QR</b>을 앱으로 찍어 주세요</li>
                <li><b>3.</b> 금액에 <b className="text-emerald-700">{won}</b>을 정확히 넣고 결제해 주세요</li>
                <li><b>4.</b> 결제가 끝나면 아래 <b>결제했어요</b>를 눌러 주세요</li>
              </ol>
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] leading-relaxed text-amber-800">
                금액이 다르면 자동으로 확인되지 않아요. 꼭 <b>{won}</b>으로 결제해 주세요.
              </p>
              <button
                type="button"
                onClick={claim}
                disabled={busy}
                className="mt-5 w-full rounded-xl bg-emerald-600 py-4 text-base font-bold text-white disabled:bg-gray-300"
              >
                {busy ? "확인하는 중…" : "결제했어요"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCard(true);
                  setPhase("choose");
                }}
                className="mt-2 w-full py-2 text-[13px] text-gray-500 underline"
              >
                카드로 결제할게요
              </button>
            </>
          ) : (
            <div className="mt-4 text-[14px] leading-relaxed text-gray-700">
              <div className="flex items-center gap-2 font-semibold text-gray-900">
                {phase === "claimed" && (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                )}
                결제를 확인하고 있어요
              </div>
              <p className="mt-2">
                확인되면 바로 이용권이 발급돼요. 보통 1분 안에 끝나요.
              </p>
              <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-[13px] text-gray-600">
                확인이 늦어져도 <b>오늘은 출석(입장)하실 수 있어요.</b> 센터에서 결제를 확인한 뒤
                이용권을 발급해 드려요.
                {phase === "expired" && " 발급되면 앱 알림으로 알려드릴게요."}
              </p>
            </div>
          )}
        </div>
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3.5 py-3 text-sm text-red-700">{error}</p>}
      </section>
    );
  }

  /* ── 결제 수단 고르기 (카드 + 온누리) ── */
  return (
    <>
      {showCard && props.cardPay}

      <div className="mt-8 flex items-center gap-3 text-xs text-gray-400">
        <span className="h-px flex-1 bg-gray-200" />
        또는
        <span className="h-px flex-1 bg-gray-200" />
      </div>

      <section className="mt-5 rounded-xl border border-gray-200 p-4">
        <p className="text-sm font-bold text-gray-900">모바일 온누리상품권</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-gray-500">
          센터 카운터에 있는 <b>가맹점 QR</b>로 결제해요. <b>센터에 계실 때</b> 이용해 주세요.
        </p>
        <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg bg-gray-50 px-3.5 py-3">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"
          />
          <span className="text-[13px] leading-relaxed text-gray-700">
            주문 내용을 확인했으며, <b>서비스 제공기간·취소·환불 규정</b>에 동의합니다.
            {props.policyHref && (
              <>
                {" "}
                <a href={props.policyHref} target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 underline">
                  정책 보기
                </a>
              </>
            )}
          </span>
        </label>
        <button
          type="button"
          onClick={start}
          disabled={busy || !agreed}
          className="mt-3 w-full rounded-xl border-2 border-emerald-600 py-3.5 text-[15px] font-bold text-emerald-700 disabled:border-gray-200 disabled:text-gray-300"
        >
          {busy ? "준비 중…" : `온누리로 ${won} 결제하기`}
        </button>
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3.5 py-3 text-sm text-red-700">{error}</p>}
      </section>
    </>
  );
}
