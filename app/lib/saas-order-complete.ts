import "server-only";
import { supabase } from "@/app/lib/supabase";
import { kstTodayYmd } from "@/app/lib/crm-coupons";
import { findPlan, nextExpiryOn } from "@/app/lib/saas-plans";
import { SAAS_ORDER_TTL_MINUTES, currentSubscription } from "@/app/lib/saas-subscription";

/**
 * CRM 이용권 주문의 **발급 단일 경로**.
 *
 * 브라우저 검증(`/api/saas/orders/confirm`)과 포트원 웹훅이 **둘 다** 이 파일을 쓴다.
 * 두 곳이 각자 구독을 연장하면 한 번 결제하고 두 달이 늘어난다.
 *
 * 🚨 2026-09-24 센터 이용권에서 실제로 난 사고를 그대로 피한다:
 *    브라우저 승인과 웹훅이 0.03초 차로 둘 다 `pending` 을 읽고 각자 발급해
 *    77,000원 받고 154,000원어치가 나갔다. 원인은 "읽어서 확인하고 쓰는" 멱등 체크였다.
 *    → `claimSaasOrder()` 의 **조건부 UPDATE** 로 한쪽만 이기게 한다.
 */

export interface SaasOrderRow {
  id: number;
  order_uid: string;
  firebase_uid: string;
  center_id: number;
  plan_code: string;
  plan_name: string;
  period_months: number;
  amount_won: number;
  status: string;
  expires_at: string | null;
  subscription_id: number | null;
  pg_receipt_url: string | null;
  /** 이 주문을 어느 PG 로 결제하는가 — 주문 생성 시점에 박힌다 */
  pg_provider: string | null;
  /** 토스 paymentKey 또는 포트원 imp_uid */
  pg_payment_key: string | null;
}

export const SAAS_ORDER_SELECT =
  "id, order_uid, firebase_uid, center_id, plan_code, plan_name, period_months, " +
  "amount_won, status, expires_at, subscription_id, pg_receipt_url, pg_provider, pg_payment_key";

/**
 * 시한 지난 pending 주문을 정리한다.
 *
 * 🚨 이걸 안 돌리면 센터가 **영구히 재구매를 못 한다.** `uniq_saas_orders_pending_center`
 *    가 센터당 pending/processing 주문을 1개로 묶어두기 때문에, 결제창을 열었다가
 *    닫아버린 주문 하나가 그 자리를 계속 차지한다.
 *
 * 🚨 `processing` 은 건드리지 않는다 — 지금 발급 중이라는 뜻이다.
 *    지우면 이중 발급이나 유실이 난다. (센터 이용권 `expireStaleOrders` 와 같은 규칙)
 */
export async function expireStaleSaasOrders(opts: { centerId?: number } = {}) {
  let q = supabase
    .from("saas_orders")
    .update({ status: "canceled", fail_reason: "결제 시간 초과", updated_at: new Date().toISOString() } as never)
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString());
  if (opts.centerId) q = q.eq("center_id", opts.centerId);
  const { error } = await q;
  if (error) console.error("[saas] 만료 주문 정리 실패", error.message);
}

export interface ClaimResult {
  won: boolean;
  reason?: "already_done" | "in_progress" | "not_found" | "bad_status";
  order?: SaasOrderRow;
}

/**
 * 발급 권한을 **원자적으로 선점**한다 (pending → processing).
 *
 * 조건부 UPDATE 라서 동시에 두 요청이 들어와도 한쪽만 행을 바꾼다.
 * 이긴 쪽만 구독을 연장한다.
 *
 * @param allowStale 웹훅 경로에서 true. 시한이 지나 canceled 된 주문이라도
 *   **PG 가 결제됐다고 하면 발급한다.** 돈이 실제로 들어온 쪽을 언제나 우선한다 —
 *   막으면 "결제는 됐는데 이용권이 없는" 사장님이 생긴다.
 */
export async function claimSaasOrder(orderId: number, allowStale = false): Promise<ClaimResult> {
  const from = allowStale ? ["pending", "canceled", "failed"] : ["pending"];
  const { data, error } = await supabase
    .from("saas_orders")
    .update({ status: "processing", updated_at: new Date().toISOString() } as never)
    .eq("id", orderId)
    .in("status", from)
    .select(SAAS_ORDER_SELECT);
  if (error) {
    console.error("[saas] 주문 선점 실패", error.message);
    return { won: false, reason: "bad_status" };
  }
  const rows = (data ?? []) as unknown as SaasOrderRow[];
  if (rows.length === 1) return { won: true, order: rows[0] };

  // 선점 실패 — 이미 끝났는지, 다른 요청이 처리 중인지 구분해서 알려준다
  const { data: cur } = await supabase
    .from("saas_orders")
    .select(SAAS_ORDER_SELECT)
    .eq("id", orderId)
    .maybeSingle();
  const order = (cur as unknown as SaasOrderRow | null) ?? undefined;
  if (!order) return { won: false, reason: "not_found" };
  if (order.status === "paid" && order.subscription_id) return { won: false, reason: "already_done", order };
  return { won: false, reason: "in_progress", order };
}

/** 선점을 되돌린다 — 발급 직전에 실패했을 때만 */
export async function releaseSaasClaim(orderId: number) {
  await supabase
    .from("saas_orders")
    .update({ status: "pending", updated_at: new Date().toISOString() } as never)
    .eq("id", orderId)
    .eq("status", "processing");
}

export interface CompleteResult {
  ok: boolean;
  error?: string;
  status?: number;
  subscriptionId?: number;
  expiresOn?: string;
}

/**
 * 구독 생성 또는 연장 → 주문 확정.
 *
 * 연장 기준일은 **이어붙이기**다 (`moducm-crm-chain-start-date` 와 같은 규칙):
 *   · 아직 유효한 구독이 있으면 → 기존 만료일 **다음 날**부터 1개월 더
 *     (만료 전에 미리 결제한 사장님이 남은 기간을 잃지 않는다)
 *   · 만료됐거나 구독이 없으면 → **오늘**부터 1개월
 */
export async function completeSaasOrder(opts: {
  order: SaasOrderRow;
  pg: {
    paymentKey?: string;
    approvedAt?: string;
    method?: string;
    receiptUrl?: string;
    raw?: unknown;
  };
}): Promise<CompleteResult> {
  const { order, pg } = opts;
  const plan = findPlan(order.plan_code);
  const months = plan?.periodMonths ?? order.period_months;
  const today = kstTodayYmd();

  const existing = await currentSubscription(order.center_id);
  const stillLive = !!existing && existing.status === "active" && today <= existing.expires_on;

  // 🚨 기간 계산은 saas-plans.nextExpiryOn() 한 곳에서만 한다 (테스트도 같은 함수를 쓴다)
  const period = nextExpiryOn({
    currentExpiresOn: stillLive ? existing!.expires_on : null,
    periodMonths: months,
    todayYmd: today,
  });
  const newExpiresOn = period.expiresOn;
  const nowIso = new Date().toISOString();

  let subscriptionId: number;
  if (existing) {
    const { data, error } = await supabase
      .from("saas_subscriptions")
      .update({
        plan_code: order.plan_code,
        firebase_uid: order.firebase_uid,
        status: "active",
        // 끊겼다 다시 결제한 경우엔 시작일도 새로 쓴다
        started_on: stillLive ? existing.started_on : today,
        expires_on: newExpiresOn,
        updated_at: nowIso,
      } as never)
      .eq("id", existing.id)
      .select("id");
    if (error || !data || data.length === 0) {
      // 🚨 돈 관련 UPDATE 는 반드시 error 를 확인한다 (조용한 실패가 과거에 세 번 났다)
      return { ok: false, error: `구독 연장 실패: ${error?.message ?? "변경된 행 없음"}`, status: 500 };
    }
    subscriptionId = existing.id;
  } else {
    const { data, error } = await supabase
      .from("saas_subscriptions")
      .insert({
        center_id: order.center_id,
        firebase_uid: order.firebase_uid,
        plan_code: order.plan_code,
        status: "active",
        started_on: today,
        expires_on: newExpiresOn,
      } as never)
      .select("id")
      .single();
    if (error || !data) {
      return { ok: false, error: `구독 생성 실패: ${error?.message ?? "알 수 없음"}`, status: 500 };
    }
    subscriptionId = (data as { id: number }).id;
  }

  const { error: orderErr } = await supabase
    .from("saas_orders")
    .update({
      status: "paid",
      subscription_id: subscriptionId,
      pg_payment_key: pg.paymentKey || null,
      pg_approved_at: pg.approvedAt || null,
      pg_method: pg.method || null,
      pg_receipt_url: pg.receiptUrl || null,
      pg_raw: (pg.raw ?? null) as never,
      fail_reason: null,
      updated_at: nowIso,
    } as never)
    .eq("id", order.id);
  if (orderErr) {
    /* 구독은 이미 늘어났다. 주문 상태만 못 적은 것이라 되돌리지 않는다 —
       되돌리면 사장님이 돈을 내고 이용권을 잃는다. 기록만 남기고 사람이 맞춘다. */
    console.error("[saas] 주문 확정 기록 실패(구독은 반영됨)", order.order_uid, orderErr.message);
  }

  return { ok: true, subscriptionId, expiresOn: newExpiresOn };
}

/** 검증 실패 등으로 주문을 접는다 */
export async function failSaasOrder(orderId: number, reason: string) {
  const { error } = await supabase
    .from("saas_orders")
    .update({ status: "failed", fail_reason: reason, updated_at: new Date().toISOString() } as never)
    .eq("id", orderId);
  if (error) console.error("[saas] 주문 실패 기록 실패", error.message);
}

/** 주문 유효시한 */
export function saasOrderExpiresAt(): string {
  return new Date(Date.now() + SAAS_ORDER_TTL_MINUTES * 60 * 1000).toISOString();
}
