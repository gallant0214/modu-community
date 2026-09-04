import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import { sendCrmSms, loadMemberPhones, smsAllowedForCenter } from "@/app/lib/crm-sms";
import {
  SCAN_TRIGGERS,
  computeMatches,
  renderMessage,
  paymentText,
  basisText,
  loadCenterName,
  loadJoinLink,
  kstYmd,
  type TriggerSetting,
} from "../_engine";

export const dynamic = "force-dynamic";

interface FullSetting extends TriggerSetting {
  enabled: boolean;
  message_body: string;
  methods: unknown;
}

/**
 * POST /api/crm/auto-messages/run
 * 활성화된 스캔 트리거를 지금 평가해 조건에 맞는 회원을 발송 대기열(crm_auto_message_queue)에 적재.
 * 중복(같은 회원·트리거·오늘)은 dedupe_key 로 방지.
 *
 * 전송 방법에 '문자메시지'(sms)를 켠 알림은 적재 직후 **실제 문자로 발송**한다.
 * (그 외 채널 push/알림톡 등은 큐에 pending 으로 남아 회원앱·연동에서 소비)
 * → { byTrigger, total, sms: { sent, failed, skipped, message } }
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "messages.auto_edit"))) {
    return NextResponse.json({ error: "자동 메세지 권한이 없습니다" }, { status: 403 });
  }

  const { data: settings } = await supabase
    .from("crm_auto_message_settings")
    .select("trigger_key, send_basis, send_days, send_count, enabled, message_body, methods, config")
    .eq("center_id", ctx.centerId)
    .eq("enabled", true);

  const center = await loadCenterName(ctx.centerId);
  const appLink = await loadJoinLink(ctx.centerId);
  const today = kstYmd();
  const byTrigger: Record<string, number> = {};
  let total = 0;

  for (const s of (settings ?? []) as (FullSetting & { config?: { send_days_dir?: "before" | "after" } | null })[]) {
    if (!SCAN_TRIGGERS.has(s.trigger_key)) continue;
    let matches;
    try {
      matches = await computeMatches(ctx.centerId, { ...s, send_days_dir: s.config?.send_days_dir });
    } catch {
      continue;
    }
    if (!matches.length) {
      byTrigger[s.trigger_key] = 0;
      continue;
    }
    const rows = matches.map((m) => ({
      center_id: ctx.centerId,
      trigger_key: s.trigger_key,
      member_id: m.member_id,
      message: renderMessage(s.message_body, {
        center,
        name: m.name,
        product: m.product,
        expiry: m.expiry,
        payment: paymentText(m.product, m.price),
        appLink,
        basis: basisText(s.trigger_key, s, today, m.expiry),
      }),
      methods: (Array.isArray(s.methods) ? s.methods : []) as never,
      status: "pending",
      dedupe_key: `${s.trigger_key}:${m.member_id}:${today}`,
      scheduled_for: today,
    }));
    // 중복(dedupe_key)은 무시하고 신규만 적재
    const { error } = await supabase
      .from("crm_auto_message_queue")
      .upsert(rows as never, { onConflict: "center_id,dedupe_key", ignoreDuplicates: true });
    if (error) {
      byTrigger[s.trigger_key] = 0;
      continue;
    }
    byTrigger[s.trigger_key] = matches.length;
    total += matches.length;
  }

  // ── 문자메시지(sms) 채널이 켜진 대기건 실제 발송 ────────────────────
  //    한 번의 실행이 대량 발송으로 번지지 않도록 상한을 둔다.
  const SMS_MAX_PER_RUN = 200;
  const sms = { sent: 0, failed: 0, skipped: 0, message: "" };
  const canSend =
    smsAllowedForCenter(ctx.centerId) && (await ctxHasPermission(ctx, "messages.send"));

  if (!canSend) {
    sms.message = smsAllowedForCenter(ctx.centerId)
      ? "문자 발송 권한이 없어 큐에만 적재했어요"
      : "이 센터는 문자 발송이 잠금 상태예요 (큐에만 적재)";
  } else {
    const { data: pending } = await supabase
      .from("crm_auto_message_queue")
      .select("id, member_id, message, methods, trigger_key")
      .eq("center_id", ctx.centerId)
      .eq("status", "pending")
      .eq("scheduled_for", today)
      .limit(SMS_MAX_PER_RUN + 1);

    const targets = ((pending ?? []) as {
      id: number;
      member_id: number;
      message: string;
      methods: unknown;
      trigger_key: string;
    }[]).filter((q) => Array.isArray(q.methods) && (q.methods as string[]).includes("sms"));

    if (targets.length > SMS_MAX_PER_RUN) {
      sms.skipped = targets.length - SMS_MAX_PER_RUN;
      targets.length = SMS_MAX_PER_RUN;
    }

    if (targets.length > 0) {
      const phones = await loadMemberPhones(
        ctx.centerId,
        targets.map((t) => t.member_id)
      );
      // 문구가 회원마다 다르므로 동일 문구끼리 묶어 발송 횟수를 줄인다.
      const groups = new Map<string, { ids: number[]; receivers: string[] }>();
      for (const t of targets) {
        const phone = phones.get(t.member_id);
        if (!phone) {
          sms.failed += 1;
          continue;
        }
        const g = groups.get(t.message) ?? { ids: [], receivers: [] };
        g.ids.push(t.id);
        g.receivers.push(phone);
        groups.set(t.message, g);
      }

      const sentIds: number[] = [];
      for (const [message, g] of groups) {
        const r = await sendCrmSms({
          centerId: ctx.centerId,
          uid: ctx.uid,
          receivers: g.receivers,
          msg: message,
          title: center,
          tag: "자동메세지",
        });
        if (r.ok) {
          sms.sent += r.sent;
          sms.failed += r.failed;
          sentIds.push(...g.ids);
        } else {
          sms.failed += g.receivers.length;
          if (!sms.message) sms.message = r.message;
        }
      }

      if (sentIds.length > 0) {
        for (let i = 0; i < sentIds.length; i += 500) {
          await supabase
            .from("crm_auto_message_queue")
            .update({ status: "sent", sent_at: new Date().toISOString() } as never)
            .in("id", sentIds.slice(i, i + 500));
        }
      }
    }
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "auto_message.run",
    entity_type: "auto_message_queue",
    entity_id: null,
    payload: { byTrigger, total, sms } as never,
  });

  return NextResponse.json({ byTrigger, total, sms });
}
