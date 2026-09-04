import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import { smsAllowedForCenter } from "@/app/lib/crm-sms";
import { dispatchQueued } from "@/app/lib/crm-auto-message";
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
 * 적재 직후 전송 방법(methods)에 따라 실제 발송한다.
 *   sms   : 문자
 *   push  : 앱 푸시 (앱 미설치·미로그인 회원은 발송 안 됨)
 *   smart : 앱 설치(기기 토큰 있음) → 푸시 / 그 외 → 문자
 *   alimtalk: 연동 준비중 (선택값만 저장, 큐에 pending 유지)
 * → { byTrigger, total, sms:{...}, push:{...} }
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
        lastVisit: m.lastVisit,
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

  // ── 대기건 실제 발송 (sms / push / smart) ──────────────────────────
  //    한 번의 실행이 대량 발송으로 번지지 않도록 상한을 둔다.
  const MAX_PER_RUN = 200;
  const smsAllowed =
    smsAllowedForCenter(ctx.centerId) && (await ctxHasPermission(ctx, "messages.send"));

  const { data: pending } = await supabase
    .from("crm_auto_message_queue")
    .select("id, member_id, message, methods")
    .eq("center_id", ctx.centerId)
    .eq("status", "pending")
    .eq("scheduled_for", today)
    .limit(MAX_PER_RUN + 1);

  const rows = ((pending ?? []) as {
    id: number;
    member_id: number;
    message: string;
    methods: unknown;
  }[]).map((q) => ({ ...q, methods: Array.isArray(q.methods) ? (q.methods as string[]) : [] }));

  let skipped = 0;
  if (rows.length > MAX_PER_RUN) {
    skipped = rows.length - MAX_PER_RUN;
    rows.length = MAX_PER_RUN;
  }

  const dispatched = await dispatchQueued({
    centerId: ctx.centerId,
    uid: ctx.uid,
    centerName: center,
    rows,
    smsAllowed,
  });
  const sms = { ...dispatched.sms, skipped };
  const push = dispatched.push;

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "auto_message.run",
    entity_type: "auto_message_queue",
    entity_id: null,
    payload: { byTrigger, total, sms, push } as never,
  });

  return NextResponse.json({ byTrigger, total, sms, push });
}
