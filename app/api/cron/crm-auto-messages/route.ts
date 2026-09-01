import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { notifyMembersByIds } from "@/app/lib/member-notify";
import { solapiConfigured, solapiSend } from "@/app/lib/solapi";
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
} from "@/app/api/crm/auto-messages/_engine";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/crm-auto-messages — 매시간 실행(vercel.json).
 *
 * 센터가 [자동 메세지]에서 켠(enabled) 설정을, 지정한 발송 시각(config.send_hour, KST)에
 * 조건에 맞는 회원에게 실제 발송한다. 전송 방법(methods)에 따라 앱 푸시 / 문자(솔라피)로 보냄.
 *  - 일정/횟수 기준: 지정 시각(send_hour)에만 발송
 *  - 즉시(신규·재등록): 당일 매시간 실행 중 첫 회차에 발송(중복은 dedupe 로 방지)
 *
 * 중복 방지: crm_auto_message_queue 의 (center_id, dedupe_key) 유니크.
 *   같은 트리거·회원·날짜는 하루 1회만 발송.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const hour = new Date(Date.now() + 9 * 3600 * 1000).getUTCHours(); // KST 시(0~23)
  const today = kstYmd();

  const { data: settings } = await supabase
    .from("crm_auto_message_settings")
    .select("center_id, trigger_key, send_basis, send_days, send_count, methods, message_body, config")
    .eq("enabled", true);

  const centerCache = new Map<number, { name: string; appLink: string }>();
  let sentPush = 0;
  let sentSms = 0;
  let processed = 0;
  let skippedDup = 0;
  const errors: string[] = [];
  const MAX_SENDS = 3000; // 폭주 방지 안전장치

  for (const s of (settings ?? []) as {
    center_id: number;
    trigger_key: string;
    send_basis: string;
    send_days: number | null;
    send_count: number | null;
    methods: unknown;
    message_body: string;
    config: { send_hour?: number; send_days_dir?: "before" | "after" } | null;
  }[]) {
    if (processed >= MAX_SENDS) break;
    if (!SCAN_TRIGGERS.has(s.trigger_key)) continue;

    const cfg = s.config ?? {};
    const sendHour = typeof cfg.send_hour === "number" ? cfg.send_hour : 10;
    const immediate = s.send_basis === "immediate";
    // 일정/횟수 기준은 지정 시각에만. 즉시(신규·재등록)는 시각 무관(당일 첫 실행에 발송).
    if (!immediate && sendHour !== hour) continue;

    const methods = Array.isArray(s.methods) ? (s.methods as string[]) : [];
    const wantPush = methods.includes("push");
    const wantSms = methods.includes("sms");
    if (!wantPush && !wantSms) continue; // 발송 채널 미선택 → 건너뜀

    const setting: TriggerSetting = {
      trigger_key: s.trigger_key,
      send_basis: s.send_basis,
      send_days: s.send_days,
      send_count: s.send_count,
      send_days_dir: cfg.send_days_dir,
    };

    let matches;
    try {
      matches = await computeMatches(s.center_id, setting);
    } catch (e) {
      errors.push(`match ${s.trigger_key}@${s.center_id}: ${e instanceof Error ? e.message : "error"}`);
      continue;
    }
    if (!matches.length) continue;

    let meta = centerCache.get(s.center_id);
    if (!meta) {
      meta = { name: await loadCenterName(s.center_id), appLink: await loadJoinLink(s.center_id) };
      centerCache.set(s.center_id, meta);
    }

    for (const m of matches) {
      if (processed >= MAX_SENDS) break;
      const dedupeKey = `${s.trigger_key}:${m.member_id}:${today}`;
      const message = renderMessage(s.message_body, {
        center: meta.name,
        name: m.name,
        product: m.product,
        expiry: m.expiry,
        payment: paymentText(m.product, m.price),
        appLink: meta.appLink,
        basis: basisText(s.trigger_key, setting, today, m.expiry),
      });

      // 대기열에 pending 적재 시도 — (center_id, dedupe_key) 유니크 위반이면 이미 처리됨 → 건너뜀
      const { error: insErr } = await supabase
        .from("crm_auto_message_queue")
        .insert({
          center_id: s.center_id,
          trigger_key: s.trigger_key,
          member_id: m.member_id,
          message,
          methods: methods as never,
          status: "pending",
          dedupe_key: dedupeKey,
          scheduled_for: today,
        } as never)
        .select("id")
        .single();
      if (insErr) {
        skippedDup += 1;
        continue;
      }
      processed += 1;

      let ok = false;
      // 앱 푸시 (연동 회원만 수신 — 미연동은 기기토큰 없어 자동 무시)
      if (wantPush) {
        try {
          await notifyMembersByIds(s.center_id, [m.member_id], "message", meta.name || "알림", message);
          sentPush += 1;
          ok = true;
        } catch (e) {
          errors.push(`push#${m.member_id}: ${e instanceof Error ? e.message : "error"}`);
        }
      }
      // 문자 (솔라피 — 발신번호 설정 시)
      if (wantSms && solapiConfigured()) {
        try {
          const { data: mem } = await supabase
            .from("crm_members")
            .select("phone")
            .eq("id", m.member_id)
            .maybeSingle();
          const phone = (mem as { phone?: string | null } | null)?.phone;
          if (phone) {
            const r = await solapiSend({ receivers: [phone], msg: message });
            if (r.success > 0) {
              sentSms += 1;
              ok = true;
            }
          }
        } catch (e) {
          errors.push(`sms#${m.member_id}: ${e instanceof Error ? e.message : "error"}`);
        }
      }

      await supabase
        .from("crm_auto_message_queue")
        .update({ status: ok ? "sent" : "failed", sent_at: ok ? new Date().toISOString() : null } as never)
        .eq("center_id", s.center_id)
        .eq("dedupe_key", dedupeKey);
    }
  }

  return NextResponse.json({
    ok: true,
    hour,
    today,
    processed,
    sentPush,
    sentSms,
    skippedDup,
    errors: errors.slice(0, 20),
  });
}
