import { supabase } from "@/app/lib/supabase";
import {
  sendCrmSms,
  loadMemberPhones,
  loadPushableMembers,
  smsAllowedForCenter,
} from "@/app/lib/crm-sms";
import { sendPushToMember } from "@/app/lib/member-notify";
import { attachAutoCoupon, loadTriggerCoupons } from "@/app/lib/crm-auto-coupon";

/**
 * 자동 메세지 발송 공용 로직.
 *
 *  - `dispatchQueued()` : 대기열(crm_auto_message_queue) 행들을 채널별로 실제 발송.
 *    '지금 실행'(스캔형 트리거)과 즉시형 트리거가 같은 경로를 쓴다.
 *  - `fireAutoMessage()` : 결제·발급처럼 **사건이 일어난 그 순간** 호출해
 *    설정이 켜져 있으면 바로 적재 + 발송한다.
 *
 * 채널 규칙
 *   sms   : 문자
 *   push  : 앱 푸시 (앱 미설치·미로그인 회원은 발송 안 됨)
 *   smart : 앱 설치(기기 토큰 보유) → 푸시 / 그 외 → 문자
 *   alimtalk : 연동 준비중 (대기열에 pending 으로 남김)
 */

export interface QueuedRow {
  id: number;
  member_id: number;
  message: string;
  methods: string[];
  /** 트리거 키 — 06 쿠폰 첨부 설정을 찾는 데 쓴다 */
  trigger_key?: string | null;
}

export interface DispatchResult {
  sms: { sent: number; failed: number; message: string };
  push: { sent: number; failed: number };
}

/** KST 오늘(YYYY-MM-DD) */
export function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * 대기열 행들을 채널에 맞춰 실제 발송하고, 한 채널이라도 성공한 행을 sent 로 마킹한다.
 * 전부 실패한 행은 pending 으로 남겨 다음 실행 때 재시도된다.
 */
export async function dispatchQueued(opts: {
  centerId: number;
  uid: string;
  centerName: string;
  rows: QueuedRow[];
  /** 문자 발송 허용 여부(권한·센터 잠금). false 면 문자는 건너뛰고 사유만 남긴다. */
  smsAllowed: boolean;
}): Promise<DispatchResult> {
  const result: DispatchResult = {
    sms: { sent: 0, failed: 0, message: "" },
    push: { sent: 0, failed: 0 },
  };
  const targets = opts.rows.filter((r) =>
    r.methods.some((m) => m === "sms" || m === "push" || m === "smart")
  );
  if (targets.length === 0) return result;

  // 06 쿠폰 첨부 — 설정된 트리거면 회원마다 쿠폰 1장 발급 후 메세지에 쿠폰 정보를 넣는다
  const triggerCoupons = await loadTriggerCoupons(opts.centerId);
  if (triggerCoupons.size > 0) {
    for (const t of targets) {
      const couponId = t.trigger_key ? triggerCoupons.get(t.trigger_key) : undefined;
      if (!couponId) continue;
      t.message = await attachAutoCoupon({
        centerId: opts.centerId,
        queueId: t.id,
        memberId: t.member_id,
        couponId,
        message: t.message,
      });
    }
  }

  const memberIds = targets.map((t) => t.member_id);
  const [phones, pushable] = await Promise.all([
    loadMemberPhones(opts.centerId, memberIds),
    loadPushableMembers(opts.centerId, memberIds),
  ]);

  // 행마다 실제로 나갈 채널을 확정 — smart 는 앱 설치 여부로 갈린다.
  const smsGroups = new Map<string, { ids: number[]; receivers: string[] }>();
  const pushJobs: { id: number; memberId: number; message: string }[] = [];
  const delivered = new Set<number>();

  for (const t of targets) {
    const smart = t.methods.includes("smart");
    const canPush = pushable.has(t.member_id);
    const usePush = t.methods.includes("push") || (smart && canPush);
    const useSms = t.methods.includes("sms") || (smart && !canPush);

    if (usePush) pushJobs.push({ id: t.id, memberId: t.member_id, message: t.message });
    if (useSms) {
      const phone = phones.get(t.member_id);
      if (!phone) {
        result.sms.failed += 1;
      } else {
        const g = smsGroups.get(t.message) ?? { ids: [], receivers: [] };
        g.ids.push(t.id);
        g.receivers.push(phone);
        smsGroups.set(t.message, g);
      }
    }
  }

  // 앱 푸시 — 회원마다 문구가 달라 개별 발송 (앱 알림함에도 함께 기록됨)
  for (const j of pushJobs) {
    try {
      const tokens = await sendPushToMember(j.memberId, "auto_message", opts.centerName, j.message);
      if (tokens > 0) {
        result.push.sent += 1;
        delivered.add(j.id);
      } else {
        result.push.failed += 1;
      }
    } catch {
      result.push.failed += 1;
    }
  }

  // 문자 — 동일 문구끼리 묶어 발송 횟수를 줄인다
  if (smsGroups.size > 0) {
    if (!opts.smsAllowed) {
      result.sms.message = smsAllowedForCenter(opts.centerId)
        ? "문자 발송 권한이 없어 큐에만 적재했어요"
        : "이 센터는 문자 발송이 잠금 상태예요 (큐에만 적재)";
    } else {
      for (const [message, g] of smsGroups) {
        const r = await sendCrmSms({
          centerId: opts.centerId,
          uid: opts.uid,
          receivers: g.receivers,
          msg: message,
          title: opts.centerName,
          tag: "자동메세지",
        });
        if (r.ok) {
          result.sms.sent += r.sent;
          result.sms.failed += r.failed;
          g.ids.forEach((id) => delivered.add(id));
        } else {
          result.sms.failed += g.receivers.length;
          if (!result.sms.message) result.sms.message = r.message;
        }
      }
    }
  }

  const sentIds = Array.from(delivered);
  for (let i = 0; i < sentIds.length; i += 500) {
    await supabase
      .from("crm_auto_message_queue")
      .update({ status: "sent", sent_at: new Date().toISOString() } as never)
      .in("id", sentIds.slice(i, i + 500));
  }
  return result;
}

/**
 * 즉시형 자동 메세지 발사 — 결제·발급 직후 호출.
 * 설정이 꺼져 있거나 문구가 비어 있으면 아무 것도 하지 않는다.
 * 절대 예외를 던지지 않는다(발송 실패가 결제·발급 자체를 막으면 안 됨).
 *
 * @param dedupeSuffix 같은 날 여러 건을 각각 보내야 하므로 엔티티 id 등 고유값을 넘긴다.
 */
export async function fireAutoMessage(opts: {
  centerId: number;
  uid: string;
  triggerKey: string;
  memberId: number;
  memberName: string;
  dedupeSuffix: string | number;
  product?: string;
  expiry?: string;
  price?: number;
}): Promise<void> {
  try {
    const { data: setting } = await supabase
      .from("crm_auto_message_settings")
      .select("enabled, message_body, methods")
      .eq("center_id", opts.centerId)
      .eq("trigger_key", opts.triggerKey)
      .maybeSingle();
    const st = setting as
      | { enabled?: boolean; message_body?: string; methods?: unknown }
      | null;
    if (!st?.enabled) return;
    const template = (st.message_body ?? "").trim();
    if (!template) return;
    const methods = Array.isArray(st.methods) ? (st.methods as string[]) : [];
    if (methods.length === 0) return;

    // 순환 import 를 피하려고 필요한 것만 지연 로드
    const { renderMessage, loadCenterName, loadJoinLink, paymentText } = await import(
      "@/app/api/crm/auto-messages/_engine"
    );
    const center = await loadCenterName(opts.centerId);
    const appLink = await loadJoinLink(opts.centerId);
    const message = renderMessage(template, {
      center,
      name: opts.memberName,
      product: opts.product,
      expiry: opts.expiry,
      payment: paymentText(opts.product, opts.price),
      appLink,
      basis: "", // 즉시형은 '전송 기준'이 없다
    });

    const today = kstToday();
    const { data: inserted } = await supabase
      .from("crm_auto_message_queue")
      .upsert(
        {
          center_id: opts.centerId,
          trigger_key: opts.triggerKey,
          member_id: opts.memberId,
          message,
          methods: methods as never,
          status: "pending",
          dedupe_key: `${opts.triggerKey}:${opts.memberId}:${opts.dedupeSuffix}`,
          scheduled_for: today,
        } as never,
        { onConflict: "center_id,dedupe_key", ignoreDuplicates: true }
      )
      .select("id");
    const row = (inserted ?? [])[0] as { id: number } | undefined;
    if (!row) return; // 이미 보낸 건(중복)

    await dispatchQueued({
      centerId: opts.centerId,
      uid: opts.uid,
      centerName: center,
      rows: [{ id: row.id, member_id: opts.memberId, message, methods, trigger_key: opts.triggerKey }],
      smsAllowed: smsAllowedForCenter(opts.centerId),
    });
  } catch (e) {
    console.error("[auto-message] fire error", opts.triggerKey, e);
  }
}

/**
 * '신규등록 후 첫 상품구매 시' 자동 메세지 — 회원권·수강권 발급 직후 호출.
 *
 * 첫 구매 판정: 이 회원의 회원권 + 수강권을 통틀어 **이번 건이 생애 첫 상품**일 때만.
 *   - 🚨 과거에 0원(무료 체험·이벤트) 이용권을 받은 적이 있으면 보내지 않는다(사용자 결정 2026-09-22).
 *     이미 상품 이력이 있는 오래된 회원에게 '첫 등록 환영'이 가는 일을 막기 위함.
 *   - 이번 건 자체가 0원이면 '구매'가 아니므로 보내지 않는다.
 *   - 서비스 수강권(issue_type='service')은 이력에서 제외.
 *   - 운동복·락커(대여권)는 대상이 아니다.
 * 두 번째 구매부터는 나가지 않는다. 중복 방지는 두 겹:
 *   ① 위 판정, ② dedupe_key 를 회원당 고정("first")으로 둬서 대기열이 한 번만 적재되게.
 */
export async function fireFirstPurchaseMessage(opts: {
  centerId: number;
  uid: string;
  memberId: number;
  /** 이번에 발급한 상품 이름 */
  product: string;
  /** 이번 건 실결제 금액(0원이면 발송 안 함) */
  price: number;
  expiry?: string;
}): Promise<void> {
  try {
    if (!opts.price || opts.price <= 0) return;

    const [{ count: membershipCount }, { count: passCount }, { data: mem }] = await Promise.all([
      supabase
        .from("crm_memberships")
        .select("id", { count: "exact", head: true })
        .eq("center_id", opts.centerId)
        .eq("member_id", opts.memberId),
      supabase
        .from("crm_passes")
        .select("id", { count: "exact", head: true })
        .eq("center_id", opts.centerId)
        .eq("member_id", opts.memberId)
        .neq("issue_type", "service"),
      supabase.from("crm_members").select("name").eq("id", opts.memberId).maybeSingle(),
    ]);

    // 방금 넣은 건까지 포함해 딱 1건이어야 '생애 첫 상품'
    if ((membershipCount ?? 0) + (passCount ?? 0) !== 1) return;

    await fireAutoMessage({
      centerId: opts.centerId,
      uid: opts.uid,
      triggerKey: "first_purchase",
      memberId: opts.memberId,
      memberName: (mem as { name?: string } | null)?.name ?? "",
      dedupeSuffix: "first", // 회원당 평생 1회
      product: opts.product,
      expiry: opts.expiry,
      price: opts.price,
    });
  } catch (e) {
    console.error("[auto-message] first purchase error", e);
  }
}
