import { supabase } from "@/app/lib/supabase";
import { restoreCouponAfterRefund, findCouponIssueForPayment } from "@/app/lib/crm-coupons-server";
import { markOrderItemRefunded } from "@/app/lib/crm-order-refund";

/**
 * 환불 기록 공용 로직 — 결제내역 탭과 상품 상세(회원권·수강권·대여권)가 같은 원장을 남긴다.
 *
 * 원칙
 *  - 환불하면 상품은 회수(status='refunded')하고, **실제로 돌려준 금액**을 `crm_payment_refunds` 에 남긴다.
 *  - 돌려준 금액이 결제액보다 적으면 `is_partial=true`(부분 환불).
 *  - 결제행(`crm_payments.amount_won`)은 손대지 않는다 — 결제한 사실과 환불한 사실을 둘 다 남기는 게 원장이다.
 */

export type ProductKind = "membership" | "pass" | "rental";

const PRODUCT_FK: Record<ProductKind, string> = {
  membership: "membership_id",
  pass: "pass_id",
  rental: "rental_id",
};

/** 상품에 달린 결제행(가장 최근 유효 건) */
export async function findProductPayment(
  centerId: number,
  kind: ProductKind,
  productId: number
): Promise<{
  id: number;
  member_id: number;
  amount_won: number;
  status: string;
  order_id: number | null;
  paid_at: string;
} | null> {
  const { data } = await supabase
    .from("crm_payments")
    .select("id, member_id, amount_won, status, order_id, paid_at")
    .eq("center_id", centerId)
    .eq(PRODUCT_FK[kind], productId)
    .order("paid_at", { ascending: false })
    .limit(1);
  return (
    (data?.[0] as {
      id: number; member_id: number; amount_won: number; status: string; order_id: number | null; paid_at: string;
    } | undefined) ?? null
  );
}

/** 요청 본문에서 환불 금액을 읽는다. 값이 없으면 전액(paidWon). */
export function parseRefundWon(raw: unknown, paidWon: number): { won: number } | { error: string } {
  if (raw === undefined || raw === null || raw === "") return { won: Math.max(0, paidWon) };
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n) || n < 0) return { error: "환불 금액이 올바르지 않아요" };
  if (n > Math.max(0, paidWon)) {
    return { error: `결제 금액(${Math.max(0, paidWon).toLocaleString()}원)보다 많이 환불할 수 없어요` };
  }
  return { won: n };
}

/**
 * DELETE 요청에 실려 온 환불 정보.
 * 본문(JSON) 우선, 없으면 쿼리스트링(?refund_won=&reason=) — 중간 프록시가 DELETE 본문을
 * 떨어뜨려도 금액이 전액으로 둔갑하지 않게 두 경로를 모두 읽는다.
 */
export async function readRefundBody(
  request: Request
): Promise<{ refund_won?: unknown; reason?: string | null; restore_mileage?: boolean }> {
  try {
    const b = (await request.json()) as
      | { refund_won?: unknown; reason?: string | null; restore_mileage?: boolean }
      | null;
    if (b && b.refund_won !== undefined) return b;
  } catch {
    // 본문 없음 — 쿼리로 넘어간다
  }
  const q = new URL(request.url).searchParams;
  const won = q.get("refund_won");
  return {
    refund_won: won === null ? undefined : won,
    reason: q.get("reason"),
    restore_mileage: q.get("restore_mileage") === "1",
  };
}

/**
 * 환불 이력 INSERT + 결제행 상태 갱신 + 쿠폰 복원 + 묶음 주문 표시.
 * 결제행이 없으면(0원 발급·이관분) 이력만 남긴다.
 */
export async function recordRefund(opts: {
  centerId: number;
  memberId: number;
  actorUid: string;
  refundWon: number;
  paidWon: number;
  reason?: string | null;
  payment?: { id: number; order_id: number | null; status: string } | null;
  /** 쿠폰 복원 판정용 — 어떤 상품을 환불했는지 */
  product?: { kind: ProductKind; id: number };
  /** 마일리지 정산 — 쓴 포인트는 돌려주고 적립분은 회수한다 (환불 창에서 체크한 경우) */
  mileage?: { used: number; earned: number };
}): Promise<{ error?: string }> {
  const { centerId, memberId, actorUid, refundWon, paidWon, reason, payment, product } = opts;
  const mileageUsed = Math.max(0, Math.floor(opts.mileage?.used ?? 0));
  const mileageEarned = Math.max(0, Math.floor(opts.mileage?.earned ?? 0));

  const { error } = await supabase.from("crm_payment_refunds").insert({
    center_id: centerId,
    member_id: memberId,
    payment_id: payment?.id ?? null,
    order_id: payment?.order_id ?? null,
    amount_won: refundWon,
    source: "center",
    is_partial: refundWon < Math.max(0, paidWon),
    reason: (reason ?? "")?.toString().trim() || null,
    actor_uid: actorUid,
  } as never);
  if (error) return { error: error.message };

  if (payment && payment.status !== "refunded") {
    await supabase
      .from("crm_payments")
      .update({ status: "refunded" } as never)
      .eq("id", payment.id)
      .eq("center_id", centerId);
  }

  if (payment) {
    // 이 결제에 쓴 쿠폰은 회원에게 돌려준다 (결제내역 탭 환불과 같은 처리)
    if (product) {
      const issueId = await findCouponIssueForPayment({
        centerId,
        orderId: payment.order_id,
        productKind: product.kind,
        productId: product.id,
      });
      if (issueId) await restoreCouponAfterRefund(issueId);
    }
    // 묶음(주문) 결제면 이 항목만 환불로 표시하고, 전부 환불되면 주문도 환불로 바뀐다
    await markOrderItemRefunded({ centerId, paymentId: payment.id, amountWon: refundWon });
  }

  /* 마일리지 정산 — 온라인(PG) 환불과 같은 규칙:
     쓴 포인트는 돌려주고, 그 구매로 적립된 포인트는 회수한다.
     원장 사유는 기존 'order_refund' 를 재사용해 마일리지 탭 라벨이 맞게 나온다.
     [[moducm-crm-mileage-ledger]] 변동은 반드시 원장에 남긴다. */
  if (mileageUsed > 0 || mileageEarned > 0) {
    const { data: mem } = await supabase
      .from("crm_members")
      .select("mileage")
      .eq("id", memberId)
      .eq("center_id", centerId)
      .maybeSingle();
    const balance = mem?.mileage ?? 0;
    const afterReturn = balance + mileageUsed;
    const next = Math.max(0, afterReturn - mileageEarned);
    await supabase
      .from("crm_members")
      .update({ mileage: next } as never)
      .eq("id", memberId)
      .eq("center_id", centerId);
    const logs: Record<string, unknown>[] = [];
    if (mileageUsed > 0)
      logs.push({ center_id: centerId, member_id: memberId, delta: mileageUsed, reason: "order_refund", balance_after: afterReturn });
    if (mileageEarned > 0)
      logs.push({ center_id: centerId, member_id: memberId, delta: -mileageEarned, reason: "order_refund", balance_after: next });
    if (logs.length) await supabase.from("crm_member_mileage_logs").insert(logs as never);
  }
  return {};
}

/** 결제에 연결된 상품의 마일리지(사용/적립) — 환불 시 정산에 쓴다 */
export async function paymentMileage(
  centerId: number,
  pay: { membership_id?: number | null; pass_id?: number | null; rental_id?: number | null }
): Promise<{ used: number; earned: number }> {
  const table = pay.membership_id
    ? "crm_memberships"
    : pay.pass_id
      ? "crm_passes"
      : pay.rental_id
        ? "crm_rentals"
        : null;
  const id = pay.membership_id ?? pay.pass_id ?? pay.rental_id ?? null;
  if (!table || !id) return { used: 0, earned: 0 };
  const { data } = await supabase
    .from(table)
    .select("mileage_used, mileage_earned")
    .eq("id", id)
    .eq("center_id", centerId)
    .maybeSingle();
  const r = (data ?? {}) as { mileage_used?: number | null; mileage_earned?: number | null };
  return {
    used: Math.max(0, Math.floor(Number(r.mileage_used) || 0)),
    earned: Math.max(0, Math.floor(Number(r.mileage_earned) || 0)),
  };
}

/** 장바구니 묶음 판정 창 — 결제 삭제·홀딩·등록횟수와 같은 ±3초 관례 */
const CART_WINDOW_MS = 3000;

/**
 * 같은 장바구니로 함께 결제된 다른 결제들.
 * 같은 회원 + 결제 시각 ±3초(온라인은 같은 order_id). 이미 환불된 건은 제외.
 */
export async function findCartSiblings(
  centerId: number,
  payment: { id: number; member_id: number; paid_at: string; order_id: number | null }
): Promise<{ id: number; member_id: number; amount_won: number; order_id: number | null; status: string }[]> {
  const lo = new Date(Date.parse(payment.paid_at) - CART_WINDOW_MS).toISOString();
  const hi = new Date(Date.parse(payment.paid_at) + CART_WINDOW_MS).toISOString();
  const { data } = await supabase
    .from("crm_payments")
    .select("id, member_id, amount_won, order_id, status, membership_id, pass_id, rental_id")
    .eq("center_id", centerId)
    .eq("member_id", payment.member_id)
    .neq("id", payment.id)
    .neq("status", "refunded")
    .gte("paid_at", lo)
    .lte("paid_at", hi);
  const rows = (data ?? []) as {
    id: number; member_id: number; amount_won: number; order_id: number | null; status: string;
    membership_id: number | null; pass_id: number | null; rental_id: number | null;
  }[];
  // 온라인 주문이면 같은 주문만 묶는다(다른 주문이 우연히 같은 초에 들어온 경우 방지)
  return payment.order_id ? rows.filter((r) => r.order_id === payment.order_id) : rows;
}

/**
 * 장바구니로 함께 결제된 **다른 상품들도 같이 환불**한다.
 *
 * 🚨 묶음 상품(회원권+락커+운동복 등)을 한 번에 결제했는데 하나만 환불되면
 *    나머지가 유효 상품으로 남아 보유·매출이 어긋난다. 결제 삭제가 ±3초 묶음까지
 *    처리하는 것과 같은 관례를 환불에도 적용한다.
 *
 * 각 형제 결제는 **그 결제의 실결제액 전액**을 환불로 기록한다(부분 환불은 직원이 고른
 * 그 한 건에만 적용). 상품 회수·락커 원복·쿠폰 복원은 공용 경로를 그대로 탄다.
 */
export async function refundCartSiblings(opts: {
  centerId: number;
  actorUid: string;
  payment: { id: number; member_id: number; paid_at: string; order_id: number | null };
  reason?: string | null;
  /** 마일리지도 함께 정산할지 */
  settleMileage: boolean;
  /** 상품 회수 함수 (routes 가 crm-retire-issued 를 넘긴다 — 순환 import 방지) */
  retire: (paymentId: number) => Promise<{ ok: boolean; error?: string }>;
}): Promise<{ refunded: number; errors: string[] }> {
  const siblings = await findCartSiblings(opts.centerId, opts.payment);
  const errors: string[] = [];
  let refunded = 0;
  for (const sib of siblings) {
    const r = await opts.retire(sib.id);
    if (!r.ok) {
      errors.push(`#${sib.id}: ${r.error ?? "회수 실패"}`);
      continue;
    }
    const { data: pay } = await supabase
      .from("crm_payments")
      .select("id, order_id, status, membership_id, pass_id, rental_id")
      .eq("id", sib.id)
      .maybeSingle();
    const p = pay as {
      id: number; order_id: number | null; status: string;
      membership_id: number | null; pass_id: number | null; rental_id: number | null;
    } | null;
    const mileage = opts.settleMileage && p ? await paymentMileage(opts.centerId, p) : undefined;
    const rec = await recordRefund({
      centerId: opts.centerId,
      memberId: sib.member_id,
      actorUid: opts.actorUid,
      refundWon: Math.max(0, sib.amount_won ?? 0),
      paidWon: Math.max(0, sib.amount_won ?? 0),
      reason: opts.reason ? `${opts.reason} (함께 결제분)` : "함께 결제분 환불",
      payment: p ? { id: p.id, order_id: p.order_id, status: p.status } : null,
      product: p?.membership_id
        ? { kind: "membership", id: p.membership_id }
        : p?.pass_id
          ? { kind: "pass", id: p.pass_id }
          : p?.rental_id
            ? { kind: "rental", id: p.rental_id }
            : undefined,
      mileage,
    });
    if (rec.error) errors.push(`#${sib.id}: ${rec.error}`);
    else refunded++;
  }
  return { refunded, errors };
}
