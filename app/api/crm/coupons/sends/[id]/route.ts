import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import { kstTodayYmd } from "@/app/lib/crm-coupons";
import { staffDisplayName } from "@/app/lib/crm-coupons-server";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/coupons/sends/[id]   { action: "revoke_unused", reason? }
 * 이 발송으로 나간 쿠폰 중 **아직 안 쓴 것**을 한꺼번에 회수한다(잘못 보낸 발송 되돌리기).
 * 이미 사용된 쿠폰은 건드리지 않는다.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "coupons.manage"))) {
    return NextResponse.json({ error: "쿠폰 관리 권한이 없습니다" }, { status: 403 });
  }
  const sendId = Number((await params).id);
  let body: { action?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  if (body.action !== "revoke_unused") {
    return NextResponse.json({ error: "알 수 없는 작업" }, { status: 400 });
  }

  const { data: send } = await supabase
    .from("crm_coupon_sends")
    .select("id, coupon_id")
    .eq("id", sendId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!send) return NextResponse.json({ error: "발송 기록을 찾을 수 없어요" }, { status: 404 });

  const reason = String(body.reason ?? "").trim().slice(0, 200) || "발송 일괄 회수";
  const { data: done } = await supabase
    .from("crm_coupon_issues")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      revoked_by_uid: ctx.uid,
      revoked_by_name: await staffDisplayName(ctx.centerMemberId),
      revoke_reason: reason,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("send_id", sendId)
    .eq("status", "issued")
    .select("id");

  const count = done?.length ?? 0;
  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "coupon.revoke_send",
    entity_type: "coupon",
    entity_id: (send as { coupon_id: number }).coupon_id,
    payload: { send_id: sendId, revoked: count, reason, on: kstTodayYmd() } as never,
  });
  return NextResponse.json({ ok: true, revoked: count });
}
