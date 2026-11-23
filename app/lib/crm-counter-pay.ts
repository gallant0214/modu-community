/**
 * 카운터 결제 요청 — PG 가 연결되지 않은 센터의 이용권 구매.
 *
 * 🚨 PG(온라인 카드 결제)는 지금 **스페셜바디 범어점(center_id 1)만** 연결돼 있다
 *    (crm_centers.pg_enabled). 다른 센터에 PG 결제창을 띄우면 안 된다.
 *
 * 흐름
 *   1) 회원이 회원앱·홈페이지·QR 셀프가입에서 상품을 고르고 구매  → counter_state = requested
 *      (결제 페이지는 PG 결제창 대신 "카운터에서 결제해 주세요" 안내를 보여준다)
 *   2) 권한 직원(sales.counter_confirm)에게 강사앱 푸시 + CRM 상단 배너
 *   3) 직원이 카운터에서 결제를 받고 [결제완료 후 승인]          → 발급 (approved)
 *      결제 안 하고 갔으면 [요청 취소]                            → 주문 취소 (canceled)
 *
 * 🚨 주문 status 는 승인 전까지 'pending' 그대로 둔다 — 쿠폰·마일리지 선점,
 *    발급 선점(claimOrderForFulfillment) 같은 기존 장치를 그대로 쓰기 위해서다.
 *    대신 만료시각을 COUNTER_HOLD_DAYS 뒤로 밀어 결제시간 초과 정리에 바로 걸리지 않게 한다.
 */
import { supabase } from "@/app/lib/supabase";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import type { CrmContext } from "@/app/lib/crm-auth";
import type { PayMethod } from "@/app/lib/member-purchase";
import { notifyStaffMember } from "@/app/lib/crm-staff-notify";
import {
  claimOrderForFulfillment,
  completeOrder,
  releaseOrderClaim,
} from "@/app/lib/member-order-complete";

/** 직원이 처리하지 않은 요청을 붙잡아 두는 기간 — 지나면 주문 정리 크론이 취소한다 */
export const COUNTER_HOLD_DAYS = 7;

const nowIso = () => new Date().toISOString();

/** 이 센터가 PG(온라인 카드 결제)를 쓰는지 — 아니면 카운터 결제 요청으로 받는다 */
export async function centerPgEnabled(centerId: number): Promise<boolean> {
  const { data } = await supabase.from("crm_centers").select("pg_enabled").eq("id", centerId).maybeSingle();
  return !!(data as { pg_enabled?: boolean } | null)?.pg_enabled;
}

/** 주문을 만들 때 카운터 결제 요청으로 표시하는 값 */
export function counterOrderFields() {
  return {
    pg_provider: "counter",
    counter_state: "requested",
    counter_requested_at: nowIso(),
    expires_at: new Date(Date.now() + COUNTER_HOLD_DAYS * 24 * 3600_000).toISOString(),
  };
}

/** 카운터에서 받은 결제수단 — 승인할 때 직원이 고른다 */
const PAY_METHODS: Record<string, PayMethod> = {
  card: { method: "card", custom: null },
  cash: { method: "cash", custom: null },
  transfer: { method: "transfer", custom: null },
};
const PAY_LABEL: Record<string, string> = { card: "카드", cash: "현금", transfer: "계좌이체" };

/* ═══════════════════════ 요청 알림 ═══════════════════════ */

/** 요청이 들어오면 승인 권한(sales.counter_confirm)이 있는 재직 직원에게 강사앱 푸시 */
export async function notifyCounterRequest(orderId: number): Promise<void> {
  const { data } = await supabase
    .from("crm_orders")
    .select("id, center_id, member_id, product_name, amount_won")
    .eq("id", orderId)
    .maybeSingle();
  const order = data as {
    id: number;
    center_id: number;
    member_id: number;
    product_name: string;
    amount_won: number;
  } | null;
  if (!order) return;
  const [{ data: m }, { data: center }, { data: staff }] = await Promise.all([
    supabase.from("crm_members").select("name").eq("id", order.member_id).maybeSingle(),
    supabase.from("crm_centers").select("name").eq("id", order.center_id).maybeSingle(),
    supabase
      .from("crm_center_members")
      .select("id, role, grade_id, is_solo_owner")
      .eq("center_id", order.center_id)
      .eq("status", "active"),
  ]);
  const memberName = (m as { name?: string } | null)?.name ?? "회원";
  const centerName = (center as { name?: string } | null)?.name ?? "센터";
  for (const s of (staff ?? []) as { id: number; role: string; grade_id: number | null; is_solo_owner: boolean | null }[]) {
    const ok = await ctxHasPermission(
      { centerId: order.center_id, role: s.role, gradeId: s.grade_id ?? null, isSoloOwner: s.is_solo_owner ?? false } as CrmContext,
      "sales.counter_confirm"
    );
    if (!ok) continue;
    await notifyStaffMember({
      centerId: order.center_id,
      centerMemberId: s.id,
      type: "counter_pay_request",
      title: `[${centerName}] 이용권 결제 요청`,
      body: `${memberName}님이 ${order.product_name} ${order.amount_won.toLocaleString("ko-KR")}원 결제를 요청했어요 — 카운터에서 결제 후 승인해 주세요`,
      data: { kind: "counter_pay_request", order_id: String(order.id), member_id: String(order.member_id) },
    }).catch(() => {});
  }
}

/* ═══════════════════════ 대기 목록 ═══════════════════════ */

export interface CounterRequestItem {
  orderId: number;
  memberId: number;
  memberName: string;
  memberPhone: string | null;
  productName: string;
  listPriceWon: number;
  couponDiscountWon: number;
  mileageUsed: number;
  amountWon: number;
  requestedAt: string | null;
}

export async function listCounterRequests(centerId: number): Promise<CounterRequestItem[]> {
  const { data } = await supabase
    .from("crm_orders")
    .select(
      "id, member_id, product_name, list_price_won, coupon_discount_won, mileage_used, amount_won, counter_requested_at"
    )
    .eq("center_id", centerId)
    .eq("status", "pending")
    .eq("counter_state", "requested")
    .order("counter_requested_at", { ascending: true })
    .limit(100);
  const orders = (data ?? []) as {
    id: number;
    member_id: number;
    product_name: string;
    list_price_won: number;
    coupon_discount_won: number;
    mileage_used: number;
    amount_won: number;
    counter_requested_at: string | null;
  }[];
  if (orders.length === 0) return [];
  const { data: mems } = await supabase
    .from("crm_members")
    .select("id, name, phone")
    .in("id", [...new Set(orders.map((o) => o.member_id))]);
  const memMap = new Map(((mems ?? []) as { id: number; name: string; phone: string | null }[]).map((m) => [m.id, m]));
  return orders.map((o) => ({
    orderId: o.id,
    memberId: o.member_id,
    memberName: memMap.get(o.member_id)?.name ?? "회원",
    memberPhone: memMap.get(o.member_id)?.phone ?? null,
    productName: o.product_name,
    listPriceWon: o.list_price_won,
    couponDiscountWon: o.coupon_discount_won,
    mileageUsed: o.mileage_used,
    amountWon: o.amount_won,
    requestedAt: o.counter_requested_at,
  }));
}

/* ═══════════════════════ 승인 · 취소 ═══════════════════════ */

/** [결제완료 후 승인] — 카운터에서 받은 결제로 이용권 발급 */
export async function approveCounterOrder(
  centerId: number,
  orderId: number,
  actorUid: string,
  payKey: string
): Promise<{ ok: boolean; error?: string }> {
  const payMethod = PAY_METHODS[payKey];
  if (!payMethod) return { ok: false, error: "결제수단을 골라 주세요" };

  const { data: cur } = await supabase
    .from("crm_orders")
    .select("id, center_id, status, counter_state")
    .eq("id", orderId)
    .maybeSingle();
  const row = cur as { center_id: number; status: string; counter_state: string | null } | null;
  if (!row || row.center_id !== centerId) return { ok: false, error: "주문을 찾을 수 없어요" };
  if (row.status !== "pending" || row.counter_state !== "requested") {
    return { ok: false, error: "이미 처리된 요청이에요" };
  }

  const claim = await claimOrderForFulfillment(orderId);
  if (!claim.won) {
    return {
      ok: false,
      error:
        claim.reason === "already_done"
          ? "이미 발급된 주문이에요"
          : claim.reason === "in_progress"
            ? "지금 처리 중인 주문이에요"
            : "처리할 수 없는 주문이에요",
    };
  }
  const order = claim.order;
  const { data: m } = await supabase.from("crm_members").select("name").eq("id", order.member_id).maybeSingle();

  let result;
  try {
    result = await completeOrder({
      order,
      memberName: (m as { name?: string } | null)?.name ?? "회원",
      // 돈은 카운터에서 이미 받았다 — 발급이 막혀도 '결제됨' 으로 남겨 직원이 보완하게 한다
      pg: {
        method: `카운터 ${PAY_LABEL[payKey]}`,
        approvedAt: nowIso(),
        raw: { source: "counter", pay: payKey, by: actorUid },
      },
      payMethod,
    });
  } catch (e) {
    await releaseOrderClaim(orderId, "pending");
    return { ok: false, error: e instanceof Error ? e.message : "발급 실패" };
  }

  await supabase
    .from("crm_orders")
    .update({
      counter_state: "approved",
      counter_resolved_at: nowIso(),
      counter_resolved_by: actorUid,
      updated_at: nowIso(),
    } as never)
    .eq("id", orderId);

  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

/** [요청 취소] — 결제하지 않고 갔다. 주문 취소 + 쿠폰 반환 (마일리지는 주문이 끝나면 자동으로 풀린다) */
export async function cancelCounterOrder(
  centerId: number,
  orderId: number,
  actorUid: string,
  reason: string | null
): Promise<{ ok: boolean; error?: string }> {
  const { data } = await supabase
    .from("crm_orders")
    .update({
      status: "canceled",
      fail_reason: "카운터 결제 요청 취소",
      counter_state: "canceled",
      counter_cancel_reason: reason?.slice(0, 300) ?? null,
      counter_resolved_at: nowIso(),
      counter_resolved_by: actorUid,
      updated_at: nowIso(),
    } as never)
    .eq("id", orderId)
    .eq("center_id", centerId)
    .eq("status", "pending")
    .eq("counter_state", "requested")
    .select("id, coupon_issue_id");
  const row = ((data ?? []) as { id: number; coupon_issue_id: number | null }[])[0];
  if (!row) return { ok: false, error: "이미 처리된 요청이에요" };
  if (row.coupon_issue_id) {
    const { releaseCoupon } = await import("@/app/lib/crm-coupons-server");
    await releaseCoupon(row.coupon_issue_id);
  }
  return { ok: true };
}
