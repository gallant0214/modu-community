import { NextResponse } from "next/server";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { requirePermission } from "@/app/lib/crm-permissions";
import { dismissOnnuriCancel, refundOnnuriCancel } from "@/app/lib/crm-onnuri";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/onnuri/cancels/[알림 id]
 *   { action: "refund", order_id }  — 가맹점 앱에서 취소한 결제 → 그 주문 환불(이용권 회수)
 *   { action: "dismiss" }           — 온라인 주문과 관계없는 취소 (카운터 직접 결제 등)
 * 권한: sales.onnuri_confirm
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  const denied = await requirePermission(ctx, "sales.onnuri_confirm");
  if (denied) return denied;

  const { id } = await params;
  const notiId = Number(id);
  if (!notiId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  let body: { action?: string; order_id?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  if (body.action === "refund") {
    const orderId = Number(body.order_id);
    if (!orderId) return NextResponse.json({ error: "환불할 결제를 골라 주세요" }, { status: 400 });
    const r = await refundOnnuriCancel(ctx.centerId, notiId, orderId, ctx.uid);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true, note: r.note });
  }
  if (body.action === "dismiss") {
    const r = await dismissOnnuriCancel(ctx.centerId, notiId, ctx.uid);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
}
