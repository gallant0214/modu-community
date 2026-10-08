"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 포트원(PortOne) **V1** 결제창 — KG이니시스 신용·체크카드.
 *
 * 🚨 토스 결제위젯과 구조가 다르다.
 *   토스   : 결제수단·약관 UI 를 위젯이 **페이지 안에** 그려줬다.
 *   포트원 : 버튼을 누르면 **PG 창이 바로 열린다**. 페이지에 그릴 UI 가 없다.
 *            → 결제수단 안내와 **구매 조건 동의**를 우리가 직접 만들어야 한다.
 *              (전자상거래법상 필수 고지이고, PG 심사도 이 동의 절차를 본다)
 *
 * 🚨 모바일은 **콜백이 오지 않는다**. 이니시스는 모바일에서 페이지를 떠나
 *    m_redirect_url 로 되돌아온다. 그래서 두 경로를 모두 지원해야 한다:
 *      PC     → 콜백(rsp) → 우리가 done 페이지로 이동
 *      모바일 → PG 가 직접 done 페이지로 redirect (imp_uid 가 쿼리로 붙어 온다)
 *    둘 다 같은 done 페이지에 도착하므로 검증 로직은 한 벌이다.
 *
 * 금액은 **부모가 서버에서 받아 내려준 값**만 쓴다. 여기서 금액을 만들거나 고치는
 * 코드가 생기면 그 순간 위변조 경로가 열린다. (서버가 imp_uid 로 다시 검증하긴 하지만,
 * 애초에 틀린 금액으로 결제창을 띄우면 회원 돈이 먼저 빠진 뒤 자동취소된다)
 */

const SDK_URL = "https://cdn.iamport.kr/v1/iamport.js";

interface ImpResponse {
  success?: boolean;
  imp_uid?: string | null;
  merchant_uid?: string;
  error_code?: string | null;
  error_msg?: string | null;
}

interface ImpGlobal {
  init: (impCode: string) => void;
  request_pay: (params: Record<string, unknown>, cb: (rsp: ImpResponse) => void) => void;
}

/** iamport.js 를 한 번만 받아 전역 IMP 를 돌려준다 */
function loadImp(): Promise<ImpGlobal> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as { IMP?: ImpGlobal };
    if (w.IMP) return resolve(w.IMP);

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_URL}"]`);
    const onReady = () => (w.IMP ? resolve(w.IMP) : reject(new Error("결제 모듈을 불러오지 못했어요")));
    if (existing) {
      existing.addEventListener("load", onReady);
      existing.addEventListener("error", () => reject(new Error("결제 모듈을 불러오지 못했어요")));
      return;
    }
    const el = document.createElement("script");
    el.src = SDK_URL;
    el.async = true;
    el.onload = onReady;
    el.onerror = () => reject(new Error("결제 모듈을 불러오지 못했어요"));
    document.head.appendChild(el);
  });
}

export default function PayClient(props: {
  orderUid: string;
  token: string;
  centerId: number;
  amount: number;
  orderName: string;
  customerName: string;
  /** 포트원 V1 필수값 — 숫자만 */
  customerTel: string;
  impCode: string;
  channelKey: string;
  /** 센터 판매 페이지 주소 — 약관·정책 링크용 */
  slug?: string;
  /**
   * 결제 후 돌아올 경로. 기본은 센터 이용권 결제의 `/pay/<주문>/done`.
   * CRM 이용권(구독) 결제는 `/billing/pay/<주문>/done` 를 넘긴다.
   * 🚨 모바일은 콜백이 없어 PG 가 이 주소로 직접 redirect 하므로, 주문 종류에 맞지
   *    않으면 "주문을 찾을 수 없어요" 가 되고 결제가 유실된 것처럼 보인다.
   */
  donePath?: string;
  /** 약관 동의 문구 아래 띄울 정책 링크 (slug 없는 플랫폼 결제용) */
  policyHref?: string;
  /** 회원앱이 연 결제창인지 — 끝나면 앱으로 되돌려보낸다 */
  returnToApp?: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const impRef = useRef<ImpGlobal | null>(null);

  useEffect(() => {
    let alive = true;
    loadImp()
      .then((imp) => {
        if (!alive) return;
        imp.init(props.impCode);
        impRef.current = imp;
        setReady(true);
      })
      .catch((e: unknown) => {
        /* 실패 원인을 숨기지 않는다 — 결제창이 안 뜨는 이유는 대부분 채널·키 설정이고,
           메시지를 봐야 어디를 고칠지 알 수 있다. */
        console.error("[portone] 결제 모듈 로드 실패", e);
        if (alive) setError(e instanceof Error ? e.message : "결제 모듈을 불러오지 못했어요");
      });
    return () => {
      alive = false;
    };
  }, [props.impCode]);

  /** 결제 결과를 들고 갈 주소 — 콜백과 모바일 redirect 가 같은 곳으로 모인다 */
  const doneUrl = useCallback(
    (extra?: Record<string, string>) => {
      const u = new URL(
        props.donePath ?? `/pay/${props.orderUid}/done`,
        window.location.origin
      );
      u.searchParams.set("t", props.token);
      u.searchParams.set("centerId", String(props.centerId));
      if (props.returnToApp) u.searchParams.set("rn", "1");
      for (const [k, v] of Object.entries(extra ?? {})) u.searchParams.set(k, v);
      return u.toString();
    },
    [props.orderUid, props.token, props.centerId, props.returnToApp, props.donePath]
  );

  function pay() {
    const imp = impRef.current;
    if (!imp || busy || !agreed) return;
    setBusy(true);
    setError(null);

    imp.request_pay(
      {
        channelKey: props.channelKey,
        pay_method: "card",
        /** 🚨 주문번호 = 우리 order_uid. 서버가 이 값으로 결제와 주문을 맞춘다 */
        merchant_uid: props.orderUid,
        name: props.orderName,
        amount: props.amount,
        buyer_name: props.customerName || undefined,
        buyer_tel: props.customerTel || undefined,
        /** 모바일은 콜백이 없다 — 이 주소로 되돌아온다 */
        m_redirect_url: doneUrl(),
      },
      (rsp) => {
        // PC 콜백 경로. 실패도 done 페이지가 안내하도록 그대로 넘긴다
        if (rsp.success && rsp.imp_uid) {
          window.location.replace(doneUrl({ imp_uid: rsp.imp_uid, imp_success: "true" }));
          return;
        }
        const msg = rsp.error_msg ?? "";
        // 사용자가 결제창을 닫은 경우도 여기로 온다 — 에러로 떠들지 않는다
        if (/취소|cancel/i.test(msg)) {
          setBusy(false);
          return;
        }
        window.location.replace(
          doneUrl({
            imp_success: "false",
            ...(rsp.imp_uid ? { imp_uid: rsp.imp_uid } : {}),
            ...(rsp.error_code ? { error_code: rsp.error_code } : {}),
            ...(msg ? { error_msg: msg } : {}),
          })
        );
      }
    );
  }

  return (
    <div className="mt-6">
      <section className="rounded-xl border border-gray-200 p-4">
        <p className="text-sm font-bold text-gray-900">결제 수단</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-gray-500">
          신용·체크카드로 결제하실 수 있습니다. 결제하기를 누르면 카드사 결제창이 열립니다.
        </p>
      </section>

      {/* 🚨 구매 조건 확인 및 결제 동의 — 전자상거래법상 필수.
          토스 위젯이 대신 그려주던 부분이라, PG 를 바꾸면서 직접 만들어야 했다. */}
      <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-xl bg-gray-50 px-4 py-3.5">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
        />
        <span className="text-[13px] leading-relaxed text-gray-700">
          주문 내용을 확인했으며, <b>서비스 제공기간·취소·환불 규정</b>에 동의합니다.
          {(props.policyHref || props.slug) && (
            <>
              {" "}
              <a
                href={props.policyHref ?? `/shop/${props.slug}/policy`}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-blue-600 underline"
              >
                정책 보기
              </a>
            </>
          )}
        </span>
      </label>

      {error && (
        <div className="mt-3 rounded-lg bg-red-50 px-3.5 py-3 text-sm leading-relaxed text-red-700">
          <p className="font-semibold">결제창을 열 수 없어요</p>
          <p className="mt-1 break-all text-[13px]">{error}</p>
          <p className="mt-2 text-[12.5px] text-red-600/80">
            잠시 후 다시 시도해 주세요. 계속 같은 화면이면 센터로 알려주세요.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={pay}
        disabled={!ready || busy || !agreed}
        className="mt-5 w-full rounded-xl bg-blue-600 py-4 text-base font-bold text-white disabled:bg-gray-300"
      >
        {!ready
          ? "결제 준비 중…"
          : busy
            ? "결제창을 여는 중…"
            : `${props.amount.toLocaleString()}원 결제하기`}
      </button>
      {!agreed && ready && (
        <p className="mt-2 text-center text-xs text-gray-400">위 동의에 체크하시면 결제할 수 있어요</p>
      )}
    </div>
  );
}
