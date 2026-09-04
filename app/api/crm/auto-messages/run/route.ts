import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import {
  sendCrmSms,
  loadMemberPhones,
  loadPushableMembers,
  smsAllowedForCenter,
} from "@/app/lib/crm-sms";
import { sendPushToMember } from "@/app/lib/member-notify";
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
  const sms = { sent: 0, failed: 0, skipped: 0, message: "" };
  const push = { sent: 0, failed: 0 };
  const smsAllowed =
    smsAllowedForCenter(ctx.centerId) && (await ctxHasPermission(ctx, "messages.send"));

  const { data: pending } = await supabase
    .from("crm_auto_message_queue")
    .select("id, member_id, message, methods")
    .eq("center_id", ctx.centerId)
    .eq("status", "pending")
    .eq("scheduled_for", today)
    .limit(MAX_PER_RUN + 1);

  const queued = ((pending ?? []) as {
    id: number;
    member_id: number;
    message: string;
    methods: unknown;
  }[]).map((q) => ({ ...q, methods: Array.isArray(q.methods) ? (q.methods as string[]) : [] }));

  const targets = queued.filter((q) =>
    q.methods.some((m) => m === "sms" || m === "push" || m === "smart")
  );
  if (targets.length > MAX_PER_RUN) {
    sms.skipped = targets.length - MAX_PER_RUN;
    targets.length = MAX_PER_RUN;
  }

  if (targets.length > 0) {
    const memberIds = targets.map((t) => t.member_id);
    const [phones, pushable] = await Promise.all([
      loadMemberPhones(ctx.centerId, memberIds),
      loadPushableMembers(ctx.centerId, memberIds),
    ]);

    // 행마다 실제로 나갈 채널을 확정 — smart 는 앱 설치 여부로 갈린다.
    const smsGroups = new Map<string, { ids: number[]; receivers: string[] }>();
    const pushJobs: { id: number; memberId: number; message: string }[] = [];
    const delivered = new Set<number>();

    for (const t of targets) {
      const wantPush = t.methods.includes("push");
      const wantSms = t.methods.includes("sms");
      const smart = t.methods.includes("smart");
      const canPush = pushable.has(t.member_id);

      const usePush = wantPush || (smart && canPush);
      const useSms = wantSms || (smart && !canPush);

      if (usePush) pushJobs.push({ id: t.id, memberId: t.member_id, message: t.message });
      if (useSms) {
        const phone = phones.get(t.member_id);
        if (!phone) {
          sms.failed += 1;
        } else {
          const g = smsGroups.get(t.message) ?? { ids: [], receivers: [] };
          g.ids.push(t.id);
          g.receivers.push(phone);
          smsGroups.set(t.message, g);
        }
      }
    }

    // 앱 푸시 — 회원별 문구가 달라 개별 발송 (알림함에도 함께 기록됨)
    for (const j of pushJobs) {
      try {
        const tokens = await sendPushToMember(j.memberId, "auto_message", center, j.message);
        if (tokens > 0) {
          push.sent += 1;
          delivered.add(j.id);
        } else {
          push.failed += 1;
        }
      } catch {
        push.failed += 1;
      }
    }

    // 문자 — 동일 문구끼리 묶어 발송 횟수를 줄인다
    if (smsGroups.size > 0) {
      if (!smsAllowed) {
        sms.message = smsAllowedForCenter(ctx.centerId)
          ? "문자 발송 권한이 없어 큐에만 적재했어요"
          : "이 센터는 문자 발송이 잠금 상태예요 (큐에만 적재)";
      } else {
        for (const [message, g] of smsGroups) {
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
            g.ids.forEach((id) => delivered.add(id));
          } else {
            sms.failed += g.receivers.length;
            if (!sms.message) sms.message = r.message;
          }
        }
      }
    }

    // 한 채널이라도 나간 건만 sent 처리 (전부 실패한 건은 pending 으로 남겨 다음 실행에 재시도)
    const sentIds = Array.from(delivered);
    for (let i = 0; i < sentIds.length; i += 500) {
      await supabase
        .from("crm_auto_message_queue")
        .update({ status: "sent", sent_at: new Date().toISOString() } as never)
        .in("id", sentIds.slice(i, i + 500));
    }
  }

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
