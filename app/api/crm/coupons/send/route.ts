import { NextResponse, after } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import { notifyMembersByIds } from "@/app/lib/member-notify";
import { inferMsgType, normalizePhone, solapiConfigured, solapiSend } from "@/app/lib/solapi";
import { logSmsSend } from "@/app/lib/crm-sms-log";
import { resolveAudience } from "@/app/api/crm/messages/route";
import {
  benefitText,
  conditionText,
  defaultCouponMessage,
  effectiveStatus,
  generateCouponCode,
  issueExpiryYmd,
  kstTodayYmd,
} from "@/app/lib/crm-coupons";
import { loadCoupons, paginateAll } from "@/app/lib/crm-coupons-db";
import { staffDisplayName } from "@/app/lib/crm-coupons-server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** 문자 발송 허용 센터 — 메세지 전송 화면과 같은 규칙 */
const SMS_ALLOWED_CENTER = 1;
const SMS_CHUNK = 1000;

/**
 * POST /api/crm/coupons/send
 * body: {
 *   coupon_id,
 *   audience_kind: 'all'|'active'|'expiring'|'expired'|'unassigned'|'dormant'|'individual',
 *   member_ids?, within_days?, inactive_days?,
 *   channels: ('push'|'sms')[]   — 빈 배열이면 알림 없이 쿠폰함에만 발급
 *   message?: string              — 비우면 기본 안내 문구
 * }
 * 회원마다 고유 코드가 붙은 쿠폰 1장씩 발급하고, 선택한 채널로 안내한다.
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "coupons.send"))) {
    return NextResponse.json({ error: "쿠폰 발송 권한이 없습니다" }, { status: 403 });
  }

  let body: {
    coupon_id?: number;
    audience_kind?: string;
    member_ids?: number[];
    within_days?: number;
    inactive_days?: number;
    channels?: string[];
    message?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const couponId = Number(body.coupon_id);
  const coupon = (await loadCoupons(ctx.centerId, [couponId])).get(couponId);
  if (!coupon) return NextResponse.json({ error: "쿠폰을 찾을 수 없어요" }, { status: 404 });
  if ((coupon.status ?? "active") !== "active") {
    return NextResponse.json({ error: "보관된 쿠폰은 발송할 수 없어요" }, { status: 400 });
  }
  if (coupon.valid_mode === "until" && coupon.valid_until && coupon.valid_until < kstTodayYmd()) {
    return NextResponse.json({ error: "사용 기한이 이미 지난 쿠폰이에요" }, { status: 400 });
  }

  const kind = body.audience_kind ?? "";
  const validKinds = ["all", "active", "expiring", "expired", "unassigned", "individual", "dormant"];
  if (!validKinds.includes(kind)) {
    return NextResponse.json({ error: "발송 대상을 선택해 주세요" }, { status: 400 });
  }

  const channels = Array.from(new Set((body.channels ?? []).filter((c) => c === "push" || c === "sms")));
  const wantsPush = channels.includes("push");
  const wantsSms = channels.includes("sms");
  if (wantsSms && ctx.centerId !== SMS_ALLOWED_CENTER) {
    return NextResponse.json({ error: "이 센터는 문자 발송을 사용할 수 없어요" }, { status: 403 });
  }
  if (wantsSms && !solapiConfigured()) {
    return NextResponse.json({ error: "문자 발송 설정이 완료되지 않았어요" }, { status: 400 });
  }

  let memberIds = await resolveAudience(ctx.centerId, kind, {
    member_ids: body.member_ids ?? [],
    within_days: Math.max(1, Math.min(60, body.within_days ?? 7)),
    inactive_days: Math.max(1, Math.min(365, body.inactive_days ?? 14)),
  });
  if (memberIds.length === 0) {
    return NextResponse.json({ error: "조건에 맞는 회원이 없어요" }, { status: 400 });
  }

  // 1인 1장: 이 쿠폰을 아직 쓸 수 있게 들고 있는 회원은 건너뛴다
  let skipped = 0;
  if (coupon.one_per_member) {
    const held = await paginateAll<{ member_id: number; status: string; expires_at: string | null }>((f, t) =>
      supabase
        .from("crm_coupon_issues")
        .select("member_id, status, expires_at")
        .eq("coupon_id", couponId)
        .eq("status", "issued")
        .range(f, t)
    );
    const holding = new Set(held.filter((h) => effectiveStatus(h) === "issued").map((h) => h.member_id));
    const before = memberIds.length;
    memberIds = memberIds.filter((id) => !holding.has(id));
    skipped = before - memberIds.length;
    if (memberIds.length === 0) {
      return NextResponse.json(
        { error: `대상 ${before}명이 모두 이미 이 쿠폰을 갖고 있어요 (1인 1장)` },
        { status: 400 }
      );
    }
  }

  const expiresAt = issueExpiryYmd(coupon);
  const message =
    (body.message ?? "").trim().slice(0, 1000) ||
    defaultCouponMessage({
      centerName: ctx.centerName,
      couponName: coupon.name,
      benefit: benefitText(coupon),
      condition: conditionText(coupon),
      expiresAt,
    });
  const channel = wantsPush && wantsSms ? "both" : wantsPush ? "push" : wantsSms ? "sms" : "none";
  const sentByName = await staffDisplayName(ctx.centerMemberId);

  const { data: send, error: sendErr } = await supabase
    .from("crm_coupon_sends")
    .insert({
      center_id: ctx.centerId,
      coupon_id: couponId,
      channel,
      message: channel === "none" ? null : message,
      recipient_count: 0,
      skipped_count: skipped,
      audience_kind: kind,
      audience_filter: (kind === "individual" ? { member_ids: body.member_ids ?? [] } : null) as never,
      sent_by_uid: ctx.uid,
      sent_by_name: sentByName,
    } as never)
    .select("id")
    .single();
  if (sendErr || !send) {
    return NextResponse.json({ error: "발송 기록 생성 실패", detail: sendErr?.message }, { status: 500 });
  }
  const sendId = (send as { id: number }).id;

  // 회원마다 고유 코드로 1장씩 발급 (코드 충돌 시 해당 묶음만 코드 새로 뽑아 재시도)
  let issued = 0;
  for (let i = 0; i < memberIds.length; i += 500) {
    const chunk = memberIds.slice(i, i + 500);
    for (let attempt = 0; attempt < 3; attempt++) {
      const rows = chunk.map((mid) => ({
        center_id: ctx.centerId,
        coupon_id: couponId,
        member_id: mid,
        send_id: sendId,
        code: generateCouponCode(),
        status: "issued",
        expires_at: expiresAt,
      }));
      const { error } = await supabase.from("crm_coupon_issues").insert(rows as never);
      if (!error) {
        issued += rows.length;
        break;
      }
      if (attempt === 2) {
        return NextResponse.json({ error: "쿠폰 발급 중 오류가 났어요", detail: error.message }, { status: 500 });
      }
    }
  }

  // 문자 — 전화번호는 서버에서만 조회
  let smsSent = 0;
  let smsFailed = 0;
  if (wantsSms) {
    const phones: string[] = [];
    for (let i = 0; i < memberIds.length; i += 500) {
      const { data } = await supabase
        .from("crm_members")
        .select("phone")
        .eq("center_id", ctx.centerId)
        .in("id", memberIds.slice(i, i + 500));
      for (const r of data ?? []) {
        const p = normalizePhone(String((r as { phone?: string | null }).phone ?? ""));
        if (p) phones.push(p);
      }
    }
    const receivers = Array.from(new Set(phones));
    const title = `[${ctx.centerName}] 쿠폰 도착`;
    const msgType = inferMsgType(message);
    for (let i = 0; i < receivers.length; i += SMS_CHUNK) {
      const chunk = receivers.slice(i, i + SMS_CHUNK);
      const r = await solapiSend({ receivers: chunk, msg: message, subject: title, msgType });
      smsSent += r.success;
      smsFailed += r.failed + (r.ok ? 0 : chunk.length - r.success - r.failed);
      await logSmsSend({
        centerId: ctx.centerId,
        uid: ctx.uid,
        receivers: chunk,
        msg: message,
        msgType,
        title,
        testmode: false,
        resultCode: r.ok ? 1 : -1,
        resultMsg: r.message,
        successCnt: r.success,
        errorCnt: r.failed,
        groupId: r.groupId ?? null,
      });
    }
  }

  await supabase
    .from("crm_coupon_sends")
    .update({
      recipient_count: issued,
      push_sent: wantsPush ? issued : 0,
      sms_sent: smsSent,
      sms_failed: smsFailed,
    } as never)
    .eq("id", sendId);

  // 앱 알림(푸시 + 알림함) — 백그라운드
  if (wantsPush) {
    const pushTitle = `🎁 ${coupon.name} 쿠폰이 도착했어요`;
    after(async () => {
      await notifyMembersByIds(ctx.centerId, memberIds, "coupon", pushTitle, message, {
        couponSendId: String(sendId),
      });
    });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "coupon.send",
    entity_type: "coupon",
    entity_id: couponId,
    payload: { name: coupon.name, send_id: sendId, issued, skipped, channel } as never,
  });

  return NextResponse.json({
    ok: true,
    send_id: sendId,
    issued,
    skipped,
    channel,
    sms: wantsSms ? { sent: smsSent, failed: smsFailed } : null,
  });
}
