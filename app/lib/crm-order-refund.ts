import "server-only";
import { supabase } from "@/app/lib/supabase";

/**
 * 묶음 결제의 **항목별 환불** 뒤처리.
 *
 * 항목마다 결제원장이 따로 있어서 환불 자체는 기존 버튼이 그대로 처리한다.
 * 여기서는 그 결과를 주문에 반영한다 — 어디까지 환불됐는지 주문만 봐도 알아야 한다.
 *   · 일부만 환불 → 주문은 paid 로 두고 환불된 금액만 누적
 *   · 전부 환불   → 주문도 refunded
 */
export async function markOrderItemRefunded(opts: {
  centerId: number;
  paymentId: number;
  amountWon: number;
  at?: string;
}): Promise<{ orderId: number | null; allRefunded: boolean }> {
  const at = opts.at ?? new Date().toISOString();

  const { data: itemRow } = await supabase
    .from("crm_order_items")
    .select("id, order_id")
    .eq("payment_id", opts.paymentId)
    .eq("center_id", opts.centerId)
    .maybeSingle();
  const item = itemRow as { id: number; order_id: number } | null;
  if (!item) return { orderId: null, allRefunded: false };

  await supabase
    .from("crm_order_items")
    .update({ refunded_at: at, refund_amount: opts.amountWon, updated_at: at } as never)
    .eq("id", item.id);

  return syncOrderRefundState(item.order_id, at);
}

/** 항목 상태를 보고 주문의 환불 상태를 다시 계산한다 */
export async function syncOrderRefundState(
  orderId: number,
  at?: string
): Promise<{ orderId: number; allRefunded: boolean }> {
  const nowIso = at ?? new Date().toISOString();
  const { data } = await supabase
    .from("crm_order_items")
    .select("id, amount_won, refunded_at, refund_amount")
    .eq("order_id", orderId);
  const items = (data ?? []) as unknown as {
    id: number;
    amount_won: number;
    refunded_at: string | null;
    refund_amount: number | null;
  }[];
  if (items.length === 0) return { orderId, allRefunded: false };

  const refundedTotal = items.reduce((s, i) => s + (i.refunded_at ? i.refund_amount ?? 0 : 0), 0);
  const allRefunded = items.every((i) => !!i.refunded_at);

  await supabase
    .from("crm_orders")
    .update({
      // 일부만 환불이면 주문은 계속 '결제 완료' — 아직 살아있는 항목이 있다
      status: allRefunded ? "refunded" : "paid",
      refunded_at: refundedTotal > 0 ? nowIso : null,
      refund_amount: refundedTotal > 0 ? refundedTotal : null,
      updated_at: nowIso,
    } as never)
    .eq("id", orderId);

  return { orderId, allRefunded };
}

/**
 * PG 취소 금액으로 환불된 항목을 찾아낸다.
 *
 * 토스 부분취소는 "얼마를 취소했다"만 알려주고 어떤 항목인지는 모른다.
 * 금액이 딱 맞는 항목이 **하나뿐일 때만** 자동으로 연결하고,
 * 애매하면 손대지 않고 직원이 보게 남긴다 — 엉뚱한 이용권을 회수하는 것보다 낫다.
 */
export async function matchItemsByRefundAmount(opts: {
  orderId: number;
  amountWon: number;
}): Promise<{ itemIds: number[]; ambiguous: boolean }> {
  const { data } = await supabase
    .from("crm_order_items")
    .select("id, amount_won, refunded_at")
    .eq("order_id", opts.orderId);
  const live = ((data ?? []) as unknown as {
    id: number;
    amount_won: number;
    refunded_at: string | null;
  }[]).filter((i) => !i.refunded_at);

  // 남은 항목 전체 금액과 같으면 전부 환불
  const liveTotal = live.reduce((s, i) => s + i.amount_won, 0);
  if (live.length > 0 && liveTotal === opts.amountWon) {
    return { itemIds: live.map((i) => i.id), ambiguous: false };
  }

  const exact = live.filter((i) => i.amount_won === opts.amountWon);
  if (exact.length === 1) return { itemIds: [exact[0].id], ambiguous: false };

  return { itemIds: [], ambiguous: true };
}
