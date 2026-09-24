import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import { fetchTossPayment } from "@/app/lib/toss-payments";
import { applyPgCancel } from "@/app/lib/crm-pg-cancel";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/crm/orders/[id]/resync — PG 상태 다시 확인.
 *
 * CRM 에서 직접 환불하는 길을 막았기 때문에(돈은 토스에 남아 장부만 어긋난다),
 * 토스에서 취소했는데 웹훅이 오지 않은 경우를 손으로 맞출 방법이 필요하다.
 * 토스에 직접 물어보고 취소돼 있으면 웹훅과 **같은 함수**로 반영한다.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "sales.refund")) && !(await ctxHasPermission(ctx, "sales.edit"))) {
    return NextResponse.json({ error: "환불 권한이 없습니다" }, { status: 403 });
  }

  const orderId = Number((await params).id) || 0;
  const { data: row } = await supabase
    .from("crm_orders")
    .select("id, center_id, member_id, amount_won, status, coupon_issue_id, pg_payment_key")
    .eq("id", orderId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  const order = row as {
    id: number;
    center_id: number;
    member_id: number;
    amount_won: number;
    status: string;
    coupon_issue_id: number | null;
    pg_payment_key: string | null;
  } | null;
  if (!order) return NextResponse.json({ error: "주문을 찾을 수 없어요" }, { status: 404 });
  if (!order.pg_payment_key) {
    return NextResponse.json({ error: "PG 결제 정보가 없는 주문이에요" }, { status: 400 });
  }

  const look = await fetchTossPayment(order.pg_payment_key);
  if (!look.ok || !look.json) {
    return NextResponse.json(
      { error: `토스 조회 실패: ${look.error ?? "알 수 없음"}` },
      { status: 502 }
    );
  }
  const pay = look.json;
  const status = String(pay.status ?? "");

  if (status !== "CANCELED" && status !== "PARTIAL_CANCELED") {
    return NextResponse.json({
      ok: true,
      changed: false,
      status,
      message:
        status === "DONE"
          ? "토스에서는 아직 취소되지 않은 결제예요. 토스에서 취소하면 자동으로 반영됩니다."
          : `토스 결제 상태: ${status}`,
    });
  }

  const res = await applyPgCancel({ order, pay });
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
