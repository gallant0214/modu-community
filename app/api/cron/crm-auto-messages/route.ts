import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/app/lib/cron-auth";
import { supabase } from "@/app/lib/supabase";
import { smsAllowedForCenter } from "@/app/lib/crm-sms";
import { dispatchQueued, type QueuedRow } from "@/app/lib/crm-auto-message";
import {
  SCAN_TRIGGERS,
  computeMatches,
  renderMessage,
  paymentText,
  basisText,
  loadCenterName,
  loadCenterPhone,
  loadCenterAddress,
  loadCenterHours,
  loadJoinLink,
  kstYmd,
  type TriggerSetting,
} from "@/app/api/crm/auto-messages/_engine";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/crm-auto-messages — 매시간 실행(vercel.json).
 *
 * 센터가 [자동 메세지]에서 켠(enabled) 설정을, 지정한 발송 시각(config.send_hour, KST)에
 * 조건에 맞는 회원에게 실제 발송한다.
 *  - 일정/횟수 기준: 지정 시각(send_hour)에만 발송
 *  - 즉시(신규·재등록): 당일 매시간 실행 중 첫 회차에 발송(중복은 dedupe 로 방지)
 *
 * 🚨 실제 발송은 반드시 공용 헬퍼 dispatchQueued() 를 쓴다.
 *   예전엔 이 파일이 발송 로직을 따로 갖고 있어 methods 를 push/sms 로만 봤고,
 *   그 결과 **'스마트 전송'으로 설정한 알림이 자동 발송에서 통째로 빠졌다**
 *   (회원권 만료 전 안내가 2026-09 ~ 11 내내 한 건도 안 나갔다).
 *   쿠폰 첨부·쿠폰 변수 정리·푸시 전송 로그도 모두 그 헬퍼가 함께 처리한다.
 *
 * 중복 방지: crm_auto_message_queue 의 (center_id, dedupe_key) 유니크.
 *   같은 트리거·회원·날짜는 하루 1회만 발송.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const hour = new Date(Date.now() + 9 * 3600 * 1000).getUTCHours(); // KST 시(0~23)
  const today = kstYmd();

  const { data: settings } = await supabase
    .from("crm_auto_message_settings")
    .select("center_id, trigger_key, send_basis, send_days, send_count, methods, message_body, coupon_id, config")
    .eq("enabled", true);

  const centerCache = new Map<
    number,
    { name: string; appLink: string; phone: string; address: string; hours: string }
  >();
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
    coupon_id: number | null;
    config: {
      send_hour?: number;
      send_days_dir?: "before" | "after";
      expiry_basis?: "period" | "sessions";
      attendance_rules?: { product_id: number; max_days: number; coupon_id: number }[];
    } | null;
  }[]) {
    if (processed >= MAX_SENDS) break;
    if (!SCAN_TRIGGERS.has(s.trigger_key)) continue;

    const cfg = s.config ?? {};
    const sendHour = typeof cfg.send_hour === "number" ? cfg.send_hour : 10;
    const immediate = s.send_basis === "immediate";
    // 일정/횟수 기준은 지정 시각에만. 즉시(신규·재등록)는 시각 무관(당일 첫 실행에 발송).
    if (!immediate && sendHour !== hour) continue;

    const methods = Array.isArray(s.methods) ? (s.methods as string[]) : [];
    // 실제로 보낼 수 있는 채널이 하나도 없으면 적재도 하지 않는다
    // (알림톡 전용은 연동 전이라 대기열에 남기지 않음 — 예전 동작 유지)
    if (!methods.some((m) => m === "sms" || m === "push" || m === "smart")) continue;

    const setting: TriggerSetting = {
      trigger_key: s.trigger_key,
      send_basis: s.send_basis,
      send_days: s.send_days,
      send_count: s.send_count,
      send_days_dir: cfg.send_days_dir,
      expiry_basis: cfg.expiry_basis,
      attendance_rules: cfg.attendance_rules,
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
      meta = {
        name: await loadCenterName(s.center_id),
        appLink: await loadJoinLink(s.center_id),
        phone: await loadCenterPhone(s.center_id),
        address: await loadCenterAddress(s.center_id),
        hours: await loadCenterHours(s.center_id),
      };
      centerCache.set(s.center_id, meta);
    }

    // ── 1) 대기열 적재 — (center_id, dedupe_key) 유니크 위반이면 이미 처리됨 → 건너뜀
    const queued: QueuedRow[] = [];
    for (const m of matches) {
      if (processed >= MAX_SENDS) break;
      // 중복 방지 키 — 트리거가 정한 키(예: 이용권 1건당 1회)가 있으면 그걸 쓴다
      const dedupeKey = m.dedupeKey ?? `${s.trigger_key}:${m.member_id}:${today}`;
      const rendered = renderMessage(s.message_body, {
        center: meta.name,
        name: m.name,
        product: m.product,
        expiry: m.expiry,
        payment: paymentText(m.product, m.price),
        appLink: meta.appLink,
        basis: basisText(s.trigger_key, setting, today, m.holdEnd ?? m.expiry),
        attendDays: m.attendDays,
        startDate: m.startDate,
        remaining: m.remaining,
        trainerName: m.trainerName,
        memberNo: m.memberNo,
        mileage: m.mileage,
        centerPhone: meta.phone,
        centerAddress: meta.address,
        centerHours: meta.hours,
        outstanding: m.outstanding,
        totalAttend: m.totalAttend,
        nextLesson: m.nextLesson,
        joinDate: m.joinDate,
        holdStart: m.holdStart,
        holdEnd: m.holdEnd,
        lastVisit: m.lastVisit,
      });

      const { data: row, error: insErr } = await supabase
        .from("crm_auto_message_queue")
        .insert({
          center_id: s.center_id,
          trigger_key: s.trigger_key,
          member_id: m.member_id,
          message: rendered,
          methods: methods as never,
          status: "pending",
          dedupe_key: dedupeKey,
          scheduled_for: today,
          // 규칙별로 쿠폰이 다른 트리거(출석일수 쿠폰)는 이 건에 붙일 쿠폰을 행에 적어 둔다
          coupon_id: m.couponId ?? null,
        } as never)
        .select("id")
        .single();
      if (insErr || !row) {
        skippedDup += 1;
        continue;
      }
      processed += 1;
      queued.push({
        id: (row as { id: number }).id,
        member_id: m.member_id,
        message: rendered,
        methods,
        trigger_key: s.trigger_key,
        coupon_id: m.couponId ?? null,
      });
    }
    if (queued.length === 0) continue;

    // ── 2) 실제 발송 — 문자/푸시/스마트 분기, 쿠폰 첨부, 전송 로그까지 공용 헬퍼가 처리
    try {
      const r = await dispatchQueued({
        centerId: s.center_id,
        uid: "cron",
        centerName: meta.name,
        rows: queued,
        smsAllowed: smsAllowedForCenter(s.center_id),
      });
      sentPush += r.push.sent;
      sentSms += r.sms.sent;
      if (r.sms.message) errors.push(`sms ${s.trigger_key}@${s.center_id}: ${r.sms.message}`);
    } catch (e) {
      errors.push(`send ${s.trigger_key}@${s.center_id}: ${e instanceof Error ? e.message : "error"}`);
    }

    // ── 3) 못 보낸 건은 failed 로 닫는다(다음 시간대에 같은 안내가 되풀이되지 않게)
    const ids = queued.map((q) => q.id);
    for (let i = 0; i < ids.length; i += 500) {
      await supabase
        .from("crm_auto_message_queue")
        .update({ status: "failed" } as never)
        .in("id", ids.slice(i, i + 500))
        .eq("status", "pending");
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
