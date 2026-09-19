import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import { staffDisplayName } from "@/app/lib/crm-coupons-server";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/coupons/issues/[id]   { action, reason? }
 *   revoke  회수      — 아직 안 쓴 쿠폰(기간 만료 포함)을 회원에게서 거둬들임
 *   restore 회수 취소  — 회수한 쿠폰을 다시 사용 가능으로
 *   unuse   사용 취소  — 결제 환불 등으로 쿠폰을 돌려줄 때. 결제·금액은 건드리지 않는다
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "coupons.manage"))) {
    return NextResponse.json({ error: "쿠폰 관리 권한이 없습니다" }, { status: 403 });
  }
  const id = Number((await params).id);
  let body: { action?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const reason = String(body.reason ?? "").trim().slice(0, 200) || null;
  const actorName = await staffDisplayName(ctx.centerMemberId);
  const now = new Date().toISOString();

  const { data: cur } = await supabase
    .from("crm_coupon_issues")
    .select("id, status, coupon_id, member_id, code")
    .eq("id", id)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  const issue = cur as { id: number; status: string; coupon_id: number; member_id: number; code: string } | null;
  if (!issue) return NextResponse.json({ error: "쿠폰을 찾을 수 없어요" }, { status: 404 });

  let from: string;
  let patch: Record<string, unknown>;
  let action: string;
  if (body.action === "revoke") {
    from = "issued";
    action = "coupon.revoke";
    patch = { status: "revoked", revoked_at: now, revoked_by_uid: ctx.uid, revoked_by_name: actorName, revoke_reason: reason };
  } else if (body.action === "restore") {
    from = "revoked";
    action = "coupon.restore_issue";
    patch = { status: "issued", revoked_at: null, revoked_by_uid: null, revoked_by_name: null, revoke_reason: null };
  } else if (body.action === "unuse") {
    from = "used";
    action = "coupon.unuse";
    patch = {
      status: "issued",
      used_at: null,
      used_by_uid: null,
      used_by_name: null,
      used_ref_kind: null,
      used_ref_id: null,
      original_price_won: null,
      discount_applied_won: null,
    };
  } else {
    return NextResponse.json({ error: "알 수 없는 작업" }, { status: 400 });
  }

  // 상태 조건부 UPDATE — 그 사이 누가 사용·회수했으면 실패로 돌려준다
  const { data: done } = await supabase
    .from("crm_coupon_issues")
    .update({ ...patch, updated_at: now } as never)
    .eq("id", id)
    .eq("status", from)
    .select("id");
  if (!done || done.length === 0) {
    const msg =
      body.action === "revoke" ? "이미 사용되었거나 회수된 쿠폰이에요" : body.action === "restore" ? "회수된 쿠폰이 아니에요" : "사용된 쿠폰이 아니에요";
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action,
    entity_type: "coupon_issue",
    entity_id: id,
    payload: { code: issue.code, member_id: issue.member_id, coupon_id: issue.coupon_id, reason } as never,
  });
  return NextResponse.json({ ok: true });
}
