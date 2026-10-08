import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import {
  fetchPortonePayment,
  fetchPortonePaymentByOrderUid,
  portoneCancelState,
  type PortonePayment,
} from "@/app/lib/portone-payments";
import {
  completeOrder,
  claimOrderForFulfillment,
  type OrderRow,
} from "@/app/lib/member-order-complete";
import { applyPgCancel } from "@/app/lib/crm-pg-cancel";
import { applySaasPgCancel } from "@/app/lib/saas-pg-cancel";
import {
  claimSaasOrder,
  completeSaasOrder,
  SAAS_ORDER_SELECT,
  type SaasOrderRow,
} from "@/app/lib/saas-order-complete";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ORDER_SELECT =
  "id, order_uid, center_id, member_id, product_id, product_name, amount_won, list_price_won, " +
  "coupon_issue_id, coupon_discount_won, mileage_used, mileage_earned, channel, status, " +
  "issued_kind, issued_id, pg_payment_key, payment_id";

/**
 * POST /api/pg/portone/webhook — 포트원(KG이니시스) 결제 상태 알림. **V1 형식.**
 *
 * 이게 왜 필요한가:
 *   회원이 카드 인증까지 마치고 **브라우저를 꺼버리면** 우리 검증(confirm)이 호출되지 않는다.
 *   포트원 쪽에서는 결제가 완료돼 있으니 "돈은 나갔는데 이용권이 없는" 회원이 생긴다.
 *   웹훅이 그걸 뒤늦게라도 잡아 발급해 준다. 취소·환불도 여기로 들어온다.
 *
 * 🚨 웹훅 본문은 믿지 않는다. imp_uid 만 꺼내 **포트원에 직접 물어본 결과**로만 판단한다.
 * 🚨 포트원 콘솔의 **웹훅 버전을 '결제모듈 V1'** 으로 맞춰야 한다.
 *    V2 로 두면 본문이 `{type, data:{paymentId}}` 로 와서 여기서 아무것도 못 꺼낸다.
 * 🚨 재시도를 부르지 않도록 항상 200 으로 답하고, 사유는 로그에 남긴다.
 *    (포트원은 2xx 가 아니면 최대 5회 재시도한다 → 같은 주문에 중복 처리가 몰린다)
 *
 * 🚨 **두 가지 주문이 이 엔드포인트로 같이 들어온다.** 포트원 콘솔에 웹훅 URL 은
 *    하나만 등록되기 때문이다. 주문번호 접두사로 가른다:
 *      `mo_` → crm_orders   (센터가 자기 회원에게 판 이용권)
 *      `sa_` → saas_orders  (우리가 사장님에게 판 CRM 이용권)
 *    섞이면 엉뚱한 테이블에서 "우리 주문이 아님" 이 나고 결제가 유실된다.
 */
export async function POST(request: Request) {
  /* V1 웹훅은 JSON 과 form-urlencoded 둘 다 올 수 있다. 한쪽만 받으면 조용히 놓친다. */
  const raw = await request.text();
  let body: Record<string, unknown> = {};
  try {
    body = raw.trim().startsWith("{")
      ? (JSON.parse(raw) as Record<string, unknown>)
      : Object.fromEntries(new URLSearchParams(raw));
  } catch {
    body = {};
  }

  const impUid = String(body.imp_uid ?? "").trim();
  const orderUidFromHook = String(body.merchant_uid ?? "").trim();
  const eventStatus = String(body.status ?? "").trim();

  // 무슨 일이 있었는지 먼저 남긴다 — 나중에 사고를 되짚을 유일한 근거
  const { data: logRow } = await supabase
    .from("crm_pg_webhook_logs")
    .insert({
      provider: "portone",
      event_type: eventStatus || null,
      payment_key: impUid || null,
      order_uid: orderUidFromHook || null,
      raw: body as never,
    } as never)
    .select("id")
    .single();
  const logId = (logRow as { id: number } | null)?.id ?? null;

  const finish = async (note: string, handled: boolean) => {
    if (logId) {
      await supabase
        .from("crm_pg_webhook_logs")
        .update({ handled, note } as never)
        .eq("id", logId);
    }
    return NextResponse.json({ ok: true, note });
  };

  if (!impUid && !orderUidFromHook) {
    /* 콘솔의 '웹훅 테스트' 호출이나, 웹훅 버전이 V2 로 설정돼 있으면 여기로 떨어진다.
       (V2 본문은 imp_uid 대신 data.paymentId 를 쓴다) */
    const looksV2 = !!body.type || !!(body.data as Record<string, unknown> | undefined)?.paymentId;
    return finish(
      looksV2
        ? "V2 형식 본문 — 포트원 콘솔의 웹훅 버전을 '결제모듈 V1' 로 바꿔야 함"
        : "imp_uid·merchant_uid 없음(호출 테스트로 보임)",
      false
    );
  }

  /* ── 포트원에 직접 확인 ─────────────────────────────
     imp_uid 가 있으면 그걸로, 없으면 주문번호로 찾는다. */
  const look = impUid
    ? await fetchPortonePayment(impUid)
    : await fetchPortonePaymentByOrderUid(orderUidFromHook);
  if (!look.ok || !look.pay) {
    return finish(`포트원 조회 실패: ${look.error ?? "알 수 없음"}`, false);
  }
  const pay = look.pay;
  const orderUid = pay.merchant_uid || orderUidFromHook;
  if (!orderUid) return finish("주문번호를 확인할 수 없음", false);

  // 🚨 주문 종류를 먼저 가른다 (위 주석 참고)
  if (orderUid.startsWith("sa_")) {
    return handleSaasOrder(orderUid, pay, finish);
  }

  const { data: orderRow } = await supabase
    .from("crm_orders")
    .select(ORDER_SELECT)
    .eq("order_uid", orderUid)
    .maybeSingle();
  const order = orderRow as unknown as
    | (OrderRow & {
        order_uid: string;
        issued_kind: string | null;
        issued_id: number | null;
        pg_payment_key: string | null;
        payment_id: number | null;
      })
    | null;
  if (!order) return finish(`우리 주문이 아님 (${orderUid})`, false);

  /* ── 취소 판정을 **먼저** 한다 ──────────────────────
     🚨 포트원은 부분취소 시 status 가 'paid' 그대로이고 cancel_amount 만 늘어난다.
        status 를 먼저 보고 'paid 면 발급' 으로 분기하면 부분취소 알림이
        발급 시도로 흘러간다. 토스(PARTIAL_CANCELED)와 다른 지점이다. */
  const cancel = portoneCancelState(pay);
  if (cancel.canceled) {
    // 처리는 공용 함수가 한다 — 'PG 상태 다시 확인'(수동)도 같은 함수를 쓴다
    const res = await applyPgCancel({ order, provider: "portone", cancel });
    return finish(res.note, res.ok && !res.needsStaff);
  }

  /* ── 결제 완료인데 아직 발급 전 → 구제 발급 ───────── */
  if (pay.status === "paid") {
    if (order.status === "paid" && order.issued_id) {
      return finish("이미 처리된 주문", true);
    }
    if (Number(pay.amount) !== order.amount_won) {
      // 금액이 다르면 손대지 않는다 — 사람이 봐야 하는 상황
      return finish(`금액 불일치 (포트원 ${pay.amount} / 주문 ${order.amount_won})`, false);
    }
    /**
     * 🚨 시한이 지나 취소된 주문이라도 **포트원이 paid 라면 발급한다.**
     *    돈이 실제로 들어온 쪽을 언제나 우선한다 — 막아버리면
     *    "결제는 됐는데 이용권이 없는" 회원이 생긴다.
     */
    if (!["pending", "canceled", "failed"].includes(order.status)) {
      // processing = 브라우저 검증이 지금 처리 중. 양보하는 게 정상 동작이라 실패로 남기지 않는다
      const normal = order.status === "processing" || order.status === "paid";
      return finish(
        normal
          ? `브라우저 검증이 처리 중이라 양보 (status=${order.status})`
          : `발급 대상 아님 (status=${order.status})`,
        normal
      );
    }
    if (order.status !== "pending" && order.coupon_issue_id) {
      // 시한 초과로 풀어줬던 쿠폰을 다시 사용 처리 — 이 주문이 그 할인으로 결제됐으므로
      await supabase
        .from("crm_coupon_issues")
        .update({ status: "used", used_at: new Date().toISOString() } as never)
        .eq("id", order.coupon_issue_id)
        .eq("status", "issued");
    }

    /* 🚨 브라우저 검증이 같은 주문을 동시에 발급할 수 있다. 한쪽만 이기게 한다.
          (2026-09-24 이중 발급 사고 — 읽고 나서 쓰는 방식은 동시 실행을 못 막는다) */
    const claim = await claimOrderForFulfillment(order.id, true);
    if (!claim.won) {
      return finish(
        claim.reason === "already_done" ? "이미 발급됨(중복 방지)" : "다른 요청이 처리 중",
        true
      );
    }

    const { data: mem } = await supabase
      .from("crm_members")
      .select("name")
      .eq("id", order.member_id)
      .maybeSingle();

    const done = await completeOrder({
      order: claim.order,
      memberName: (mem as { name?: string } | null)?.name ?? "",
      pg: {
        paymentKey: pay.imp_uid,
        approvedAt: pay.paid_at ? new Date(Number(pay.paid_at) * 1000).toISOString() : "",
        method: pay.card_name || pay.pay_method || "",
        receiptUrl: pay.receipt_url || "",
        raw: pay,
      },
    });
    return finish(done.ok ? "웹훅으로 구제 발급 완료" : `구제 발급 실패: ${done.error}`, done.ok);
  }

  return finish(`처리 대상 아닌 상태 (${pay.status})`, true);
}

/**
 * CRM 이용권(SaaS 구독) 주문 처리.
 *
 * 센터 이용권 쪽과 **순서까지 같은 규칙**을 지킨다:
 *   ① 취소 판정을 먼저 — 포트원은 부분취소 시 status 가 'paid' 그대로다
 *   ② 발급은 조건부 UPDATE 로 선점 — 브라우저 검증과의 이중 발급 방지
 *   ③ 금액이 다르면 손대지 않는다 — 사람이 봐야 한다
 */
async function handleSaasOrder(
  orderUid: string,
  pay: PortonePayment,
  finish: (note: string, handled: boolean) => Promise<NextResponse>
) {
  const { data: row } = await supabase
    .from("saas_orders")
    .select(SAAS_ORDER_SELECT)
    .eq("order_uid", orderUid)
    .maybeSingle();
  const order = row as unknown as SaasOrderRow | null;
  if (!order) return finish(`우리 주문이 아님 (${orderUid})`, false);

  const cancel = portoneCancelState(pay);
  if (cancel.canceled) {
    const res = await applySaasPgCancel({ order, cancel });
    return finish(res.note, res.ok && !res.needsStaff);
  }

  if (pay.status !== "paid") {
    return finish(`처리 대상 아닌 상태 (${pay.status})`, true);
  }
  if (order.status === "paid" && order.subscription_id) {
    return finish("이미 처리된 주문", true);
  }
  if (Number(pay.amount) !== order.amount_won) {
    return finish(`금액 불일치 (포트원 ${pay.amount} / 주문 ${order.amount_won})`, false);
  }

  /* 시한이 지나 canceled 된 주문이라도 포트원이 paid 라면 발급한다(allowStale=true).
     돈이 실제로 들어온 쪽을 언제나 우선한다 — 막으면 "결제는 됐는데 이용권이 없는"
     사장님이 생긴다. */
  const claim = await claimSaasOrder(order.id, true);
  if (!claim.won) {
    return finish(
      claim.reason === "already_done" ? "이미 발급됨(중복 방지)" : "다른 요청이 처리 중",
      true
    );
  }

  const done = await completeSaasOrder({
    order: claim.order!,
    pg: {
      paymentKey: pay.imp_uid,
      approvedAt: pay.paid_at ? new Date(Number(pay.paid_at) * 1000).toISOString() : "",
      method: pay.card_name || pay.pay_method || "",
      receiptUrl: pay.receipt_url || "",
      raw: pay,
    },
  });
  return finish(
    done.ok
      ? `웹훅으로 CRM 이용권 구제 발급 완료 (만료 ${done.expiresOn})`
      : `구제 발급 실패: ${done.error}`,
    done.ok
  );
}

/** 포트원 콘솔의 연결 확인용 */
export async function GET() {
  return NextResponse.json({ ok: true, provider: "portone", version: "v1" });
}
