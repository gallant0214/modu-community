import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import { fetchTossPayment, tossCancelState } from "@/app/lib/toss-payments";
import { fetchPortonePayment, portoneCancelState } from "@/app/lib/portone-payments";
import { applyPgCancel } from "@/app/lib/crm-pg-cancel";
import { isOnlineOrderCenter, ONLINE_ORDER_LOCKED_MESSAGE } from "@/app/lib/online-order-access";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/crm/orders/[id]/resync — PG 상태 다시 확인.
 *
 * CRM 에서 직접 환불하는 길을 막았기 때문에(돈은 PG 에 남아 장부만 어긋난다),
 * PG 에서 취소했는데 웹훅이 오지 않은 경우를 손으로 맞출 방법이 필요하다.
 * PG 에 직접 물어보고 취소돼 있으면 웹훅과 **같은 함수**로 반영한다.
 *
 * 🚨 주문의 `pg_provider` 로 갈라야 한다. 토스로 결제된 과거 주문이 남아 있으므로
 *    포트원으로 바꿨다고 토스 조회를 지워버리면 그 주문들을 영구히 맞출 수 없게 된다.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  // 온라인 주문은 스페셜바디 범어점 전용(파일럿)
  if (!isOnlineOrderCenter(ctx.centerName)) {
    return NextResponse.json({ error: ONLINE_ORDER_LOCKED_MESSAGE, code: "ONLINE_ORDER_LOCKED" }, { status: 403 });
  }
  if (!(await ctxHasPermission(ctx, "sales.refund")) && !(await ctxHasPermission(ctx, "sales.edit"))) {
    return NextResponse.json({ error: "환불 권한이 없습니다" }, { status: 403 });
  }

  const orderId = Number((await params).id) || 0;
  const { data: row } = await supabase
    .from("crm_orders")
    .select("id, order_uid, center_id, member_id, amount_won, status, coupon_issue_id, pg_payment_key, pg_provider")
    .eq("id", orderId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  const order = row as {
    id: number;
    order_uid: string;
    center_id: number;
    member_id: number;
    amount_won: number;
    status: string;
    coupon_issue_id: number | null;
    pg_payment_key: string | null;
    pg_provider: string | null;
  } | null;
  if (!order) return NextResponse.json({ error: "주문을 찾을 수 없어요" }, { status: 404 });
  if (!order.pg_payment_key) {
    return NextResponse.json({ error: "PG 결제 정보가 없는 주문이에요" }, { status: 400 });
  }

  /* ── PG 에 직접 물어본다 ──────────────────────────────
     pg_payment_key 에는 토스면 paymentKey, 포트원이면 imp_uid 가 들어 있다. */
  const provider = order.pg_provider === "portone" ? "portone" : "toss";
  const pgName = provider === "portone" ? "KG이니시스" : "토스";

  let cancel;
  let status: string;
  if (provider === "portone") {
    const look = await fetchPortonePayment(order.pg_payment_key);
    if (!look.ok || !look.pay) {
      return NextResponse.json({ error: `${pgName} 조회 실패: ${look.error ?? "알 수 없음"}` }, { status: 502 });
    }
    if (look.pay.merchant_uid && look.pay.merchant_uid !== order.order_uid) {
      return NextResponse.json({ error: "조회된 결제가 이 주문이 아니에요" }, { status: 409 });
    }
    status = look.pay.status;
    cancel = portoneCancelState(look.pay);
  } else {
    const look = await fetchTossPayment(order.pg_payment_key);
    if (!look.ok || !look.json) {
      return NextResponse.json({ error: `${pgName} 조회 실패: ${look.error ?? "알 수 없음"}` }, { status: 502 });
    }
    if (String(look.json.orderId ?? "") !== order.order_uid) {
      return NextResponse.json({ error: "조회된 결제가 이 주문이 아니에요" }, { status: 409 });
    }
    status = String(look.json.status ?? "");
    cancel = tossCancelState(look.json);
  }

  if (!cancel.canceled) {
    return NextResponse.json({
      ok: true,
      changed: false,
      status,
      message:
        status === "DONE" || status === "paid"
          ? `${pgName}에서는 아직 취소되지 않은 결제예요. ${pgName}에서 취소하면 자동으로 반영됩니다.`
          : `${pgName} 결제 상태: ${status}`,
    });
  }

  const res = await applyPgCancel({ order, provider, cancel });
  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "order.pg_resync",
    entity_type: "crm_orders",
    entity_id: order.id,
    payload: { 처리결과: res.note, 회수건수: res.retired } as never,
  });

  return NextResponse.json({ ok: res.ok, changed: true, status, message: res.note, needsStaff: res.needsStaff });
}
