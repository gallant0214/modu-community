import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import { staffDisplayName } from "@/app/lib/crm-coupons-server";
import { loadCoupons } from "@/app/lib/crm-coupons-db";
import { loadIssueSources } from "@/app/lib/crm-coupon-issue-source";
import { VOLATILE_MEMBER_TOKENS, renderCouponMessages } from "@/app/lib/crm-coupon-send-render";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/coupons/issues/[id]
 * 이 쿠폰을 받을 때 회원에게 간 안내 메세지 — 발급 내역 '발송 내용' 보기.
 *   쿠폰 발송: 앱 알림 기록(회원별 실제 문구) → 없으면(문자만 보냄) 발송 문구 원본으로 다시 만든다
 *   자동 메세지: 대기열의 최종 문구
 * exact=false 면 다시 만든 문구라 마일리지 같은 값은 지금 기준일 수 있다.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "coupons.view"))) {
    return NextResponse.json({ error: "쿠폰 조회 권한이 없습니다" }, { status: 403 });
  }
  const id = Number((await params).id);
  const { data: row } = await supabase
    .from("crm_coupon_issues")
    .select("id, coupon_id, member_id, send_id, code, expires_at")
    .eq("id", id)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  const issue = row as {
    id: number;
    coupon_id: number;
    member_id: number;
    send_id: number | null;
    code: string;
    expires_at: string | null;
  } | null;
  if (!issue) return NextResponse.json({ error: "쿠폰을 찾을 수 없어요" }, { status: 404 });

  const source = (await loadIssueSources(ctx.centerId, [{ id: issue.id, sendId: issue.send_id }])).get(issue.id) ?? {
    kind: "none" as const,
  };
  let title: string | null = null;
  let body: string | null = null;
  let exact = true;
  let note: string | null = null;

  if (source.kind === "send") {
    const { data: sendRow } = await supabase
      .from("crm_coupon_sends")
      .select("channel, message, message_template")
      .eq("id", source.sendId)
      .eq("center_id", ctx.centerId)
      .maybeSingle();
    const send = sendRow as { channel: string; message: string | null; message_template: string | null } | null;
    if (source.channel === "none") {
      note = "알림 없이 회원 쿠폰함에만 넣은 쿠폰이에요.";
    } else {
      // 앱 알림을 보냈으면 회원별 실제 문구가 알림함에 남아 있다(문자도 같은 문구)
      const { data: noti } = await supabase
        .from("crm_member_notifications")
        .select("title, body")
        .eq("center_id", ctx.centerId)
        .eq("member_id", issue.member_id)
        .eq("type", "coupon")
        .contains("data_json", { couponSendId: String(source.sendId) })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      const n = noti as { title: string | null; body: string | null } | null;
      if (n?.body) {
        title = n.title;
        body = n.body;
      } else if (send && !send.message_template) {
        // 11-10 이전 발송 — 모든 회원에게 같은 고정 문구를 보냈다
        body = send.message;
      } else if (send?.message_template) {
        const coupon = (await loadCoupons(ctx.centerId, [issue.coupon_id])).get(issue.coupon_id);
        if (coupon) {
          const rendered = await renderCouponMessages({
            centerId: ctx.centerId,
            centerName: ctx.centerName,
            template: send.message_template,
            coupon,
            expiresAt: issue.expires_at,
            memberIds: [issue.member_id],
            codeOf: new Map([[issue.member_id, issue.code]]),
          });
          body = rendered.get(issue.member_id) ?? null;
          if (VOLATILE_MEMBER_TOKENS.some((t) => send.message_template!.includes(t))) {
            exact = false;
            note = "문자로만 보낸 건이라 보낸 문구로 다시 만들었어요. 마일리지·출석 같은 값은 지금 기준일 수 있어요.";
          }
        }
      }
      if (!body) note = note ?? "보낸 메세지 기록을 찾지 못했어요.";
    }
  } else if (source.kind === "auto") {
    const { data: q } = await supabase
      .from("crm_auto_message_queue")
      .select("message")
      .eq("id", source.queueId)
      .eq("center_id", ctx.centerId)
      .maybeSingle();
    title = source.triggerLabel;
    body = (q as { message: string | null } | null)?.message ?? null;
    if (source.status !== "sent") note = `이 메세지는 아직 '${source.statusLabel}' 상태예요.`;
  } else {
    note = "발송 기록이 없는 쿠폰이에요(직접 발급되었거나 초기 테스트 기록).";
  }

  return NextResponse.json({ source, title, body, exact, note });
}

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
