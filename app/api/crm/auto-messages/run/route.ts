import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import {
  SCAN_TRIGGERS,
  computeMatches,
  renderMessage,
  loadCenterName,
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
 * 중복(같은 회원·트리거·오늘)은 dedupe_key 로 방지. 실제 발송은 회원 앱 연동 시 이 큐를 소비.
 * → { byTrigger: { [key]: number }, total: number }
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "messages.auto_edit"))) {
    return NextResponse.json({ error: "자동 메세지 권한이 없습니다" }, { status: 403 });
  }

  const { data: settings } = await supabase
    .from("crm_auto_message_settings")
    .select("trigger_key, send_basis, send_days, send_count, enabled, message_body, methods")
    .eq("center_id", ctx.centerId)
    .eq("enabled", true);

  const center = await loadCenterName(ctx.centerId);
  const today = kstYmd();
  const byTrigger: Record<string, number> = {};
  let total = 0;

  for (const s of (settings ?? []) as FullSetting[]) {
    if (!SCAN_TRIGGERS.has(s.trigger_key)) continue;
    let matches;
    try {
      matches = await computeMatches(ctx.centerId, s);
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
      message: renderMessage(s.message_body, { center, name: m.name, product: m.product, expiry: m.expiry }),
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

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "auto_message.run",
    entity_type: "auto_message_queue",
    entity_id: null,
    payload: { byTrigger, total } as never,
  });

  return NextResponse.json({ byTrigger, total });
}
