import "server-only";
import { supabase } from "@/app/lib/supabase";
import { kstTodayYmd } from "@/app/lib/crm-coupons";
import type { PgCancelState } from "@/app/lib/crm-pg-cancel";
import { currentSubscription } from "@/app/lib/saas-subscription";
import type { SaasOrderRow } from "@/app/lib/saas-order-complete";

/**
 * PG 에서 취소된 **CRM 이용권** 결제를 반영한다.
 *
 * 🚨 센터 이용권용 `applyPgCancel()` 을 쓰지 않는다. 저쪽은 주문 항목별 환불 이력,
 *    마일리지 환급, 쿠폰 복구, 이용권 회수까지 다루는 무거운 함수다.
 *    CRM 구독 환불은 "구독 기간을 되돌린다" 하나뿐이라, 섞으면 양쪽이 다 복잡해지고
 *    한쪽을 고칠 때 다른 쪽이 깨진다.
 *
 * 취소 판정은 호출부가 `portoneCancelState()` 로 정규화해서 넘긴다 —
 * 🚨 포트원은 **부분취소 시 status 가 'paid' 그대로**이고 cancel_amount 만 늘어난다.
 */

/** YYYY-MM-DD 에 개월을 더하거나 뺀다 (월말은 클램프). delta 가 음수여도 동작한다 */
function shiftMonthsYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  const totalM = y * 12 + (m - 1) + delta;
  const ny = Math.floor(totalM / 12);
  const nm = ((totalM % 12) + 12) % 12; // 음수 나머지 보정
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ny, nm, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

export interface SaasCancelResult {
  ok: boolean;
  note: string;
  /** 사람이 봐야 하는 상황 */
  needsStaff: boolean;
}

export async function applySaasPgCancel(opts: {
  order: SaasOrderRow;
  cancel: PgCancelState;
}): Promise<SaasCancelResult> {
  const { order, cancel } = opts;
  if (!cancel.canceled) {
    return { ok: false, note: "취소된 결제가 아니에요", needsStaff: false };
  }
  if (order.status === "refunded") {
    return { ok: true, note: "이미 환불 처리됨", needsStaff: false };
  }

  const nowIso = new Date().toISOString();
  const fullCancel = !cancel.isPartial;

  const { error: ordErr } = await supabase
    .from("saas_orders")
    .update({
      status: "refunded",
      refunded_at: cancel.refundedAt,
      refund_amount: cancel.canceledAmountWon || order.amount_won,
      refund_reason: cancel.reason,
      updated_at: nowIso,
    } as never)
    .eq("id", order.id);
  // 🚨 돈 관련 UPDATE 는 반드시 error 를 확인한다
  if (ordErr) {
    return { ok: false, note: `환불 기록 실패: ${ordErr.message}`, needsStaff: true };
  }

  /* 부분취소는 구독을 건드리지 않는다. 1개월권 하나뿐인 지금은 일어날 일이 없고,
     금액만 일부 돌려준 상태에서 기간을 임의로 깎으면 사장님이 더 손해를 본다.
     사실만 기록하고 사람이 판단하게 둔다. */
  if (!fullCancel) {
    return {
      ok: true,
      needsStaff: true,
      note: `부분 취소(${cancel.canceledAmountWon.toLocaleString()}원) — 구독 기간은 그대로 둠. 직원 확인 필요`,
    };
  }

  const sub = await currentSubscription(order.center_id);
  if (!sub) {
    return { ok: true, note: "환불 처리 — 연결된 구독이 없어 기간 조정 없음", needsStaff: false };
  }

  // 이 결제가 늘려준 기간만큼 되돌린다
  const rolledBack = shiftMonthsYmd(sub.expires_on, -order.period_months);
  const nothingLeft = rolledBack < sub.started_on;

  const { error: subErr } = await supabase
    .from("saas_subscriptions")
    .update({
      status: nothingLeft ? "canceled" : "active",
      expires_on: nothingLeft ? sub.started_on : rolledBack,
      updated_at: nowIso,
    } as never)
    .eq("id", sub.id);
  if (subErr) {
    return { ok: false, note: `구독 기간 되돌리기 실패: ${subErr.message}`, needsStaff: true };
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: order.center_id,
    actor_uid: "system:portone-webhook",
    action: "saas.refund_pg",
    entity_type: "saas_orders",
    entity_id: order.id,
    payload: {
      환불금액: cancel.canceledAmountWon || order.amount_won,
      상품명: order.plan_name,
      처리경로: "PG(KG이니시스)에서 결제 취소 — 대금이 반환됨",
      구독상태: nothingLeft ? "구독 취소" : `만료일 ${rolledBack} 로 단축`,
    } as never,
  });

  const blocked = nothingLeft || rolledBack < kstTodayYmd();
  return {
    ok: true,
    needsStaff: false,
    note: nothingLeft
      ? "환불 처리 — 구독 취소됨"
      : `환불 처리 — 만료일을 ${rolledBack} 로 단축${blocked ? " (즉시 이용 중지)" : ""}`,
  };
}
