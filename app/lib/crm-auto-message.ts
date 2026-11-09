import { supabase } from "@/app/lib/supabase";
import { SMS_NOT_READY_MESSAGE } from "@/app/lib/crm-sms-availability";
import {
  sendCrmSms,
  loadMemberPhones,
  loadPushableMembers,
  smsAllowedForCenter,
} from "@/app/lib/crm-sms";
import { sendPushToMember } from "@/app/lib/member-notify";
import { attachAutoCoupon, loadTriggerCoupons, stripCouponVars } from "@/app/lib/crm-auto-coupon";

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
  /** 이 건 전용 쿠폰 — 규칙별로 쿠폰이 다른 트리거(출석일수 쿠폰). 설정값보다 우선 */
  coupon_id?: number | null;
  /**
   * 회원앱이 이 사건을 **자체 푸시로 이미 알렸다**(예: 직원이 잡은 수업 예약의 '예약 확정' 푸시).
   * 앱 회원에게는 푸시를 또 보내지 않는다(같은 알림 두 번). 앱이 없는 회원·'문자'는 그대로 발송.
   */
  appNotified?: boolean;
}

export interface DispatchResult {
  sms: { sent: number; failed: number; message: string };
  /** optedOut: 회원앱에서 '센터 메세지 알림'을 끈 회원이라 푸시를 보내지 않은 건수 */
  push: { sent: number; failed: number; optedOut: number };
}

/**
 * 회원앱에서 '센터 메세지 알림'을 끈 회원(notify_center_messages=false) 집합.
 * 자동 안내 푸시는 이 회원에게 보내지 않는다 — 센터 공지·메세지 푸시와 같은 기준.
 */
async function loadPushOptOut(centerId: number, memberIds: number[]): Promise<Set<number>> {
  const out = new Set<number>();
  for (let i = 0; i < memberIds.length; i += 500) {
    const { data } = await supabase
      .from("crm_members")
      .select("id")
      .eq("center_id", centerId)
      .in("id", memberIds.slice(i, i + 500))
      .eq("notify_center_messages", false);
    for (const m of (data ?? []) as { id: number }[]) out.add(Number(m.id));
  }
  return out;
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
    push: { sent: 0, failed: 0, optedOut: 0 },
  };
  const targets = opts.rows.filter((r) =>
    r.methods.some((m) => m === "sms" || m === "push" || m === "smart")
  );
  if (targets.length === 0) return result;

  // 06 쿠폰 첨부 — 설정된 트리거면 회원마다 쿠폰 1장 발급 후 메세지에 쿠폰 정보를 넣는다
  const triggerCoupons = await loadTriggerCoupons(opts.centerId);
  if (triggerCoupons.size > 0 || targets.some((t) => t.coupon_id)) {
    for (const t of targets) {
      const couponId =
        t.coupon_id ?? (t.trigger_key ? triggerCoupons.get(t.trigger_key) : undefined);
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

  // 쿠폰이 안 붙은 건에 남아 있는 쿠폰 변수는 지운다(그대로 발송되면 '#쿠폰혜택#' 글자가 그대로 나간다)
  for (const t of targets) t.message = stripCouponVars(t.message);

  const memberIds = targets.map((t) => t.member_id);
  const [phones, pushable, pushOff] = await Promise.all([
    loadMemberPhones(opts.centerId, memberIds),
    loadPushableMembers(opts.centerId, memberIds),
    loadPushOptOut(opts.centerId, memberIds),
  ]);

  // 행마다 실제로 나갈 채널을 확정 — smart 는 앱 설치 여부로 갈린다.
  const smsGroups = new Map<string, { ids: number[]; receivers: string[] }>();
  const pushJobs: { id: number; memberId: number; message: string; triggerKey?: string | null }[] = [];
  const delivered = new Set<number>();

  for (const t of targets) {
    const smart = t.methods.includes("smart");
    const hasApp = pushable.has(t.member_id);
    // 앱이 이미 같은 사건을 푸시로 알린 회원 — 자동 메세지 푸시는 건너뛴다(스마트 전송도 앱 회원은 끝)
    const appDone = !!t.appNotified && hasApp;
    // 스마트 전송의 채널 선택은 '앱 설치 여부'로만 가른다. 알림을 끈 회원이라고
    // 문자로 돌리면 본인이 끈 안내가 유료 문자로 가므로, 푸시만 건너뛴다.
    const usePush = !appDone && (t.methods.includes("push") || (smart && hasApp)) && !pushOff.has(t.member_id);
    const useSms = t.methods.includes("sms") || (smart && !hasApp);
    if (!appDone && !usePush && pushOff.has(t.member_id) && (t.methods.includes("push") || (smart && hasApp))) {
      result.push.optedOut += 1;
    }

    // 앱이 이미 알렸고 문자도 안 보내는 건 = 처리 끝. pending 으로 두면 '지금 실행'이 푸시를 또 보낸다.
    if (appDone && !useSms) delivered.add(t.id);
    if (usePush) pushJobs.push({ id: t.id, memberId: t.member_id, message: t.message, triggerKey: t.trigger_key });
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
  const pushedByTrigger = new Map<string, { memberIds: number[]; message: string }>();
  for (const j of pushJobs) {
    try {
      const tokens = await sendPushToMember(j.memberId, "auto_message", opts.centerName, j.message);
      if (tokens > 0) {
        result.push.sent += 1;
        delivered.add(j.id);
        const key = j.triggerKey ?? "";
        const g = pushedByTrigger.get(key) ?? { memberIds: [], message: j.message };
        g.memberIds.push(j.memberId);
        g.message = j.message;
        pushedByTrigger.set(key, g);
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
        : `${SMS_NOT_READY_MESSAGE} (큐에만 적재)`;
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

  // 앱 푸시는 자체 기록이 없어 '메세지 전송 로그'에서 빠진다 → 트리거별로 한 줄 남긴다
  for (const [triggerKey, g] of pushedByTrigger) {
    if (!triggerKey) continue;
    await logAutoMessagePush({
      centerId: opts.centerId,
      triggerKey,
      message: g.message,
      memberIds: g.memberIds,
    });
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
 * 즉시형으로도 보내고 크론 스캔(SCAN_TRIGGERS)에도 들어 있는 트리거.
 *
 * 🚨 이 트리거는 대기열 중복키(dedupe_key)를 스캔형과 똑같이 '날짜'로 맞춘다.
 *   안 맞추면 발급 직후 1건(`...:<이용권id>`) + 크론 스캔 1건(`...:<날짜>`)이
 *   각각 적재돼 **같은 안내가 두 번 발송된다**
 *   (2026-09-05 '이용권 재등록 시' 안내가 한 회원에게 2건 나간 것을 확인).
 */
const ALSO_SCANNED = new Set(["membership_new", "membership_renew"]);

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
  /** 대상 상품 시작일(#시작일#) */
  startDate?: string;
  /** 홀딩 기간(#홀딩시작일# #홀딩종료일#) — 상품 홀딩 알림 */
  holdStart?: string;
  holdEnd?: string;
  /** 예약한 수업 일시(#예약일시#) — 수업 예약·취소 알림 */
  reservedAt?: string;
  /** 회원앱이 이 사건을 이미 푸시로 알렸으면 true — 앱 회원에겐 푸시를 또 보내지 않는다 */
  appNotified?: boolean;
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
    const {
      renderMessage,
      loadCenterName,
      loadJoinLink,
      loadCenterPhone,
      loadCenterAddress,
      loadCenterHours,
      loadMemberCommonVars,
      paymentText,
    } = await import("@/app/api/crm/auto-messages/_engine");
    const [center, appLink, centerPhone, centerAddress, centerHours, common] = await Promise.all([
      loadCenterName(opts.centerId),
      loadJoinLink(opts.centerId),
      loadCenterPhone(opts.centerId),
      loadCenterAddress(opts.centerId),
      loadCenterHours(opts.centerId),
      loadMemberCommonVars(opts.centerId, opts.memberId),
    ]);
    // 🚨 치환 변수는 스캔형(크론·지금 실행)과 **같은 목록을 전부** 넘겨야 한다.
    //   빠뜨린 변수는 에러 없이 빈칸으로 발송돼, 받는 사람 문구만 뚝 끊긴다.
    const message = renderMessage(template, {
      center,
      name: opts.memberName,
      product: opts.product,
      expiry: opts.expiry,
      payment: paymentText(opts.product, opts.price),
      appLink,
      basis: "", // 즉시형은 '전송 기준'이 없다
      startDate: opts.startDate,
      holdStart: opts.holdStart,
      holdEnd: opts.holdEnd,
      reservedAt: opts.reservedAt,
      centerPhone,
      centerAddress,
      centerHours,
      ...common,
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
          dedupe_key: `${opts.triggerKey}:${opts.memberId}:${
            ALSO_SCANNED.has(opts.triggerKey) ? today : opts.dedupeSuffix
          }`,
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
      rows: [
        {
          id: row.id,
          member_id: opts.memberId,
          message,
          methods,
          trigger_key: opts.triggerKey,
          appNotified: opts.appNotified,
        },
      ],
      smsAllowed: smsAllowedForCenter(opts.centerId),
    });
  } catch (e) {
    console.error("[auto-message] fire error", opts.triggerKey, e);
  }
}

/** #예약일시# 표기 — "11/8(토) 14:00" (KST). #다음수업# 과 같은 모양 */
export function fmtReservedAt(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const k = new Date(t + 9 * 3600 * 1000);
  const DOW = ["일", "월", "화", "수", "목", "금", "토"];
  const hh = String(k.getUTCHours()).padStart(2, "0");
  const mi = String(k.getUTCMinutes()).padStart(2, "0");
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()}(${DOW[k.getUTCDay()]}) ${hh}:${mi}`;
}

/** 회원 이름 — 사건 경로에 이름이 없을 때 */
async function memberNameOf(memberId: number): Promise<string> {
  const { data } = await supabase.from("crm_members").select("name").eq("id", memberId).maybeSingle();
  return (data as { name?: string } | null)?.name ?? "";
}

/**
 * '수업 예약 시' / '수업 예약 취소 시' 자동 메세지.
 * PT 예약(crm_reservations)과 클래스 예약(crm_class_bookings) 모두 여기로 부른다.
 * 중복 방지: 예약 1건당 1회(`class_booked:{회원}:{ref}`).
 * 절대 예외를 던지지 않는다(fireAutoMessage 와 같음).
 */
export async function fireReservationMessage(opts: {
  centerId: number;
  uid: string;
  kind: "booked" | "cancelled";
  memberId: number;
  /** 예약 고유값 — PT 는 `r{id}`, 클래스는 `cb{id}` */
  ref: string;
  startsAt: string | null | undefined;
  /** 수업 이름(#상품명#) — PT=수강권 수업명, 클래스=상품명 */
  product?: string;
  memberName?: string;
  appNotified?: boolean;
}): Promise<void> {
  try {
    await fireAutoMessage({
      centerId: opts.centerId,
      uid: opts.uid,
      triggerKey: opts.kind === "booked" ? "class_booked" : "class_cancelled",
      memberId: opts.memberId,
      memberName: opts.memberName ?? (await memberNameOf(opts.memberId)),
      dedupeSuffix: opts.ref,
      product: opts.product,
      reservedAt: fmtReservedAt(opts.startsAt),
      appNotified: opts.appNotified,
    });
  } catch (e) {
    console.error("[auto-message] reservation error", opts.kind, e);
  }
}

/**
 * '상품 홀딩' 자동 메세지 — 직원이 홀딩을 등록한 직후 1회(묶음으로 여러 상품이 홀딩돼도 1건).
 */
export async function fireHoldMessage(opts: {
  centerId: number;
  uid: string;
  memberId: number;
  /** 홀딩된 상품 이름들 */
  products: string[];
  start: string;
  end: string;
}): Promise<void> {
  try {
    await fireAutoMessage({
      centerId: opts.centerId,
      uid: opts.uid,
      triggerKey: "product_hold",
      memberId: opts.memberId,
      memberName: await memberNameOf(opts.memberId),
      dedupeSuffix: `h${opts.start}`,
      product: Array.from(new Set(opts.products.filter(Boolean))).join(", "),
      holdStart: opts.start,
      holdEnd: opts.end,
    });
  } catch (e) {
    console.error("[auto-message] hold error", e);
  }
}

/**
 * '계약 완료 시' 자동 메세지 — 회원 계약서 서명이 끝난 직후(직원 태블릿 서명·회원 링크 서명).
 * 직원 근로계약서(staff_member_id)나 회원 연결이 없는 계약서는 보내지 않는다(호출처에서 거름).
 */
export async function fireContractMessage(opts: {
  centerId: number;
  uid: string;
  memberId: number;
  contractId: number;
  memberName?: string;
  product?: string;
  startDate?: string;
  expiry?: string;
}): Promise<void> {
  try {
    await fireAutoMessage({
      centerId: opts.centerId,
      uid: opts.uid,
      triggerKey: "contract_completed",
      memberId: opts.memberId,
      memberName: opts.memberName || (await memberNameOf(opts.memberId)),
      dedupeSuffix: `c${opts.contractId}`,
      product: opts.product,
      startDate: opts.startDate,
      expiry: opts.expiry,
    });
  } catch (e) {
    console.error("[auto-message] contract error", e);
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

/**
 * 자동 메세지 **앱 푸시** 발송을 '메세지 전송 로그'에 남긴다.
 *
 * 로그 화면은 문자(crm_sms_logs) + 공지(crm_message_broadcasts)를 합쳐 보여주는데,
 * 자동 메세지 푸시는 어느 쪽에도 기록되지 않아 보낸 이력이 사라졌다.
 * 트리거·날짜 단위로 한 줄 남긴다(회원 한 명당 한 줄이면 로그가 금방 묻힌다).
 */
export async function logAutoMessagePush(opts: {
  centerId: number;
  triggerKey: string;
  message: string;
  memberIds: number[];
}): Promise<void> {
  if (opts.memberIds.length === 0) return;
  try {
    const { TRIGGER_BY_KEY } = await import("@/app/lib/auto-message-triggers");
    const label = TRIGGER_BY_KEY[opts.triggerKey]?.label ?? opts.triggerKey;
    await supabase.from("crm_message_broadcasts").insert({
      center_id: opts.centerId,
      title: `[자동] ${label}`,
      body: opts.message,
      audience_kind: "auto",
      audience_filter: { trigger_key: opts.triggerKey, member_ids: opts.memberIds.slice(0, 500) } as never,
      recipient_count: opts.memberIds.length,
      sent_by_uid: "auto", // 사람이 보낸 게 아니라 자동 발송 (컬럼이 NOT NULL)
      sent_by_name: "자동 메세지",
    } as never);
  } catch (e) {
    console.error("[auto-message] push log error", opts.triggerKey, e);
  }
}
