import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { requirePermission } from "@/app/lib/crm-permissions";
import { approveCounterOrder, cancelCounterOrder } from "@/app/lib/crm-counter-pay";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/counter-pay/orders/[id]
 *   { action: "approve", pay: "card" | "cash" | "transfer" } — 카운터에서 결제 받음 → 이용권 발급
 *   { action: "cancel", reason? }                             — 결제 안 함 → 주문 취소
 * 권한: sales.counter_confirm
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  const denied = await requirePermission(ctx, "sales.counter_confirm");
  if (denied) return denied;

  const { id } = await params;
  const orderId = Number(id);
  if (!orderId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  let body: { action?: string; pay?: string; reason?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  let r: { ok: boolean; error?: string };
  if (body.action === "approve") {
    r = await approveCounterOrder(ctx.centerId, orderId, ctx.uid, String(body.pay ?? ""));
  } else if (body.action === "cancel") {
    r = await cancelCounterOrder(ctx.centerId, orderId, ctx.uid, body.reason ?? null);
  } else {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: body.action === "approve" ? "counter_pay.approve" : "counter_pay.cancel",
    entity_type: "crm_orders",
    entity_id: orderId,
    payload: { pay: body.pay ?? null, reason: body.reason ?? null } as never,
  });
  return NextResponse.json({ ok: true });
}
