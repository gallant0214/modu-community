import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { requirePermission } from "@/app/lib/crm-permissions";
import { approveOnnuriOrder, rejectOnnuriOrder } from "@/app/lib/crm-onnuri";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/onnuri/orders/[id]
 *   { action: "approve", notification_id? }  — 결제 확인 → 이용권 발급
 *   { action: "reject", reason? }            — 결제 안 됨 → 주문 취소·임시 입장 종료
 * 권한: sales.onnuri_confirm (웹 CRM·강사앱 공용)
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  const denied = await requirePermission(ctx, "sales.onnuri_confirm");
  if (denied) return denied;

  const { id } = await params;
  const orderId = Number(id);
  if (!orderId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  let body: { action?: string; notification_id?: number | null; reason?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  let r: { ok: boolean; error?: string };
  if (body.action === "approve") {
    r = await approveOnnuriOrder(ctx.centerId, orderId, ctx.uid, Number(body.notification_id) || null);
  } else if (body.action === "reject") {
    r = await rejectOnnuriOrder(ctx.centerId, orderId, ctx.uid, body.reason ?? null);
  } else {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: body.action === "approve" ? "onnuri.approve" : "onnuri.reject",
    entity_type: "crm_orders",
    entity_id: orderId,
    payload: { notification_id: body.notification_id ?? null, reason: body.reason ?? null } as never,
  });
  return NextResponse.json({ ok: true });
}
