/**
 * 모바일 온누리상품권 현장 결제 — 자동 확인 + 미수 처리.
 *
 * 흐름
 *   1) 회원이 결제 화면에서 '모바일 온누리' 선택        → onnuri_state = waiting
 *   2) 카운터 가맹점 QR 로 결제 후 '결제했어요'          → claimed (확인 전까지 임시 입장)
 *   3) 카운터 공기계의 온누리 가맹점 앱 알림을 '온누리 알림 앱'이 서버로 보낸다
 *   4) 금액·시각이 맞는 주문이 딱 한 건이면 자동 발급     → matched
 *   5) 10분 안에 못 맞추면 권한 직원(sales.onnuri_confirm)에게 강사앱 푸시 + CRM 상단 배너
 *      → 직원이 [승인] 하면 발급(approved) / [거절] 하면 주문 취소(rejected)
 *
 * 🚨 자동 대조는 **회원이 '결제했어요'를 누른 주문만** 대상으로 한다.
 *    카운터에서 직원이 받는 온누리 결제(기존 방식)도 같은 가맹점 앱 알림을 만든다.
 *    '온누리를 고르기만 한' 주문까지 자동으로 맞추면, 같은 금액을 대면 결제한 다른 회원의
 *    알림이 엉뚱한 주문을 발급시킬 수 있다. 그래서 양쪽 모두 후보가 딱 하나일 때만 맞춘다.
 *
 * 🚨 주문 status 는 끝날 때까지 'pending' 그대로 둔다. 그래야 쿠폰·마일리지 선점,
 *    발급 선점(claimOrderForFulfillment) 같은 기존 장치가 그대로 동작한다.
 *    대신 '결제했어요' 이후엔 만료시각을 멀리 밀어 결제시간 초과 정리에 걸리지 않게 한다.
 */
import { createHash, randomBytes, randomInt } from "crypto";
import { supabase } from "@/app/lib/supabase";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import type { CrmContext } from "@/app/lib/crm-auth";
import type { PayMethod } from "@/app/lib/member-purchase";
import { notifyStaffMember } from "@/app/lib/crm-staff-notify";
import {
  claimOrderForFulfillment,
  completeOrder,
  releaseOrderClaim,
} from "@/app/lib/member-order-complete";

/** 직원이 손으로 넣던 기존 온누리 결제와 같은 표기 — 통계에서 한 줄로 묶인다 */
export const ONNURI_PAY: PayMethod = { method: "etc", custom: "온누리" };

/** 온누리를 고르고 '결제했어요'를 안 누른 주문이 살아 있는 시간 */
const WAIT_MINUTES = 60;
/** '결제했어요' 이후 주문을 붙잡아 두는 기간 (직원이 처리할 때까지) */
const CLAIM_HOLD_DAYS = 30;
/** 확인 전 임시 입장을 허용하는 기간 */
export const TEMP_ENTRY_DAYS = 3;
/** 이 시간 안에 못 맞추면 직원에게 확인 요청 */
export const ALERT_AFTER_MINUTES = 10;
/** 알림 시각이 주문 시작보다 이만큼 앞서도 허용 (기기 시계 오차) */
const MATCH_SKEW_MS = 2 * 60_000;
/** '결제했어요' 를 누른 뒤 이 시간 안에 온 알림까지 대조 */
const MATCH_AFTER_CLAIM_MS = 10 * 60_000;

const nowIso = () => new Date().toISOString();

/* ═══════════════════════ 기기(공기계) ═══════════════════════ */

export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
export function newDeviceToken(): string {
  return `onr_${randomBytes(24).toString("base64url")}`;
}
export function newPairCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export interface OnnuriDevice {
  id: number;
  center_id: number;
  name: string;
  source_package: string | null;
  last_seen_at: string | null;
}

/** 공기계 앱 요청 인증 — Authorization: Bearer <기기 토큰> */
export async function authDevice(request: Request): Promise<OnnuriDevice | null> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token.startsWith("onr_")) return null;
  const { data } = await supabase
    .from("crm_onnuri_devices")
    .select("id, center_id, name, source_package, last_seen_at, revoked_at")
    .eq("token_hash", hashDeviceToken(token))
    .maybeSingle();
  const row = data as (OnnuriDevice & { revoked_at: string | null }) | null;
  if (!row || row.revoked_at) return null;
  await supabase
    .from("crm_onnuri_devices")
    .update({ last_seen_at: nowIso() } as never)
    .eq("id", row.id);
  return row;
}

/** 이 센터가 온누리 결제를 받을 준비가 됐는지 — 연결된 공기계가 하나라도 있으면 */
export async function centerOnnuriEnabled(centerId: number): Promise<boolean> {
  const { data } = await supabase
    .from("crm_onnuri_devices")
    .select("id")
    .eq("center_id", centerId)
    .not("paired_at", "is", null)
    .is("revoked_at", null)
    .limit(1);
  return (data ?? []).length > 0;
}

/* ═══════════════════════ 금액 읽기 ═══════════════════════ */

/**
 * 알림 문구에서 결제 금액을 읽는다. 못 읽으면 null (직원이 수동 연결).
 * '잔액·포인트' 앞의 숫자는 결제 금액이 아니므로 건너뛴다.
 */
export function parseAmountWon(text: string): number | null {
  const re = /([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)\s*원/g;
  let first: number | null = null;
  let preferred: number | null = null;
  for (const m of text.matchAll(re)) {
    const n = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) continue;
    const before = text.slice(Math.max(0, (m.index ?? 0) - 12), m.index ?? 0);
    if (/잔액|잔고|포인트|한도/.test(before)) continue;
    if (first === null) first = n;
    if (preferred === null && /결제|승인|입금|받|금액|사용/.test(before)) preferred = n;
  }
  return preferred ?? first;
}

/* ═══════════════════════ 주문 상태 바꾸기 ═══════════════════════ */

export interface OnnuriOrderRow {
  id: number;
  order_uid: string;
  center_id: number;
  member_id: number;
  product_name: string;
  amount_won: number;
  status: string;
  coupon_issue_id: number | null;
  onnuri_state: string | null;
  onnuri_started_at: string | null;
  onnuri_claimed_at: string | null;
  onnuri_alerted_at: string | null;
  created_at: string;
}
const ORDER_COLS =
  "id, order_uid, center_id, member_id, product_name, amount_won, status, coupon_issue_id, " +
  "onnuri_state, onnuri_started_at, onnuri_claimed_at, onnuri_alerted_at, created_at";

export async function loadOnnuriOrderByUid(orderUid: string): Promise<OnnuriOrderRow | null> {
  const { data } = await supabase.from("crm_orders").select(ORDER_COLS).eq("order_uid", orderUid).maybeSingle();
  return (data ?? null) as unknown as OnnuriOrderRow | null;
}
async function loadOnnuriOrder(id: number): Promise<OnnuriOrderRow | null> {
  const { data } = await supabase.from("crm_orders").select(ORDER_COLS).eq("id", id).maybeSingle();
  return (data ?? null) as unknown as OnnuriOrderRow | null;
}

/** 회원이 결제수단으로 온누리를 골랐다 */
export async function startOnnuri(order: OnnuriOrderRow): Promise<{ ok: boolean; error?: string }> {
  if (order.status !== "pending") return { ok: false, error: "결제를 진행할 수 없는 주문이에요" };
  if (order.onnuri_state === "waiting" || order.onnuri_state === "claimed") return { ok: true };
  if (order.amount_won <= 0) return { ok: false, error: "결제할 금액이 없어요" };
  const { error } = await supabase
    .from("crm_orders")
    .update({
      onnuri_state: "waiting",
      onnuri_started_at: nowIso(),
      expires_at: new Date(Date.now() + WAIT_MINUTES * 60_000).toISOString(),
      updated_at: nowIso(),
    } as never)
    .eq("id", order.id)
    .eq("status", "pending");
  return error ? { ok: false, error: "저장하지 못했어요" } : { ok: true };
}

/** 회원이 '결제했어요'를 눌렀다 — 임시 입장 시작 + 이미 온 알림과 바로 대조 */
export async function claimOnnuri(order: OnnuriOrderRow): Promise<{ ok: boolean; error?: string; matched?: boolean }> {
  if (order.status !== "pending" || (order.onnuri_state !== "waiting" && order.onnuri_state !== "claimed")) {
    return { ok: false, error: "결제를 진행할 수 없는 주문이에요" };
  }
  if (order.onnuri_state === "waiting") {
    await supabase
      .from("crm_orders")
      .update({
        onnuri_state: "claimed",
        onnuri_claimed_at: nowIso(),
        // 직원이 처리할 때까지 결제시간 초과 정리에 걸리지 않게
        expires_at: new Date(Date.now() + CLAIM_HOLD_DAYS * 24 * 3600_000).toISOString(),
        updated_at: nowIso(),
      } as never)
      .eq("id", order.id)
      .eq("onnuri_state", "waiting");
  }
  const fresh = await loadOnnuriOrder(order.id);
  const matched = fresh ? await tryMatchOrder(fresh) : false;
  return { ok: true, matched };
}

/* ═══════════════════════ 알림 수신 + 자동 대조 ═══════════════════════ */

export interface IncomingNotification {
  package: string;
  title: string;
  text: string;
  postedAt: number; // ms
  key: string;
}

export async function ingestNotification(
  device: OnnuriDevice,
  n: IncomingNotification
): Promise<{ saved: boolean; amountWon: number | null; matchedOrderId: number | null }> {
  if (device.source_package && n.package !== device.source_package) {
    return { saved: false, amountWon: null, matchedOrderId: null };
  }
  const amount = parseAmountWon(`${n.title}\n${n.text}`);
  const postedAt = new Date(Number.isFinite(n.postedAt) && n.postedAt > 0 ? n.postedAt : Date.now());
  const { data, error } = await supabase
    .from("crm_onnuri_notifications")
    .insert({
      center_id: device.center_id,
      device_id: device.id,
      package: n.package.slice(0, 200),
      title: n.title.slice(0, 500),
      body: n.text.slice(0, 2000),
      amount_won: amount,
      posted_at: postedAt.toISOString(),
      dedupe_key: `${n.key}|${n.postedAt}`.slice(0, 300),
    } as never)
    .select("id")
    .maybeSingle();
  // 같은 알림 재전송 → 유니크 제약으로 무시
  if (error || !data) return { saved: false, amountWon: amount, matchedOrderId: null };
  const id = (data as { id: number }).id;
  const matchedOrderId = amount ? await tryMatchNotification(device.center_id, id, amount, postedAt) : null;
  if (amount && !matchedOrderId) await holdWaitingOrders(device.center_id, amount, postedAt);
  return { saved: true, amountWon: amount, matchedOrderId };
}

/**
 * 같은 금액 알림이 왔는데 회원이 '결제했어요'를 안 누른 주문(waiting)은
 * 1시간 뒤 결제시간 초과로 취소되지 않게 붙잡아 둔다 — 돈은 들어왔을 수 있다.
 * 직원 확인 목록에 남아 있다가 승인·거절로 정리된다.
 */
async function holdWaitingOrders(centerId: number, amount: number, postedAt: Date) {
  await supabase
    .from("crm_orders")
    .update({
      expires_at: new Date(Date.now() + CLAIM_HOLD_DAYS * 24 * 3600_000).toISOString(),
      updated_at: nowIso(),
    } as never)
    .eq("center_id", centerId)
    .eq("status", "pending")
    .eq("onnuri_state", "waiting")
    .eq("amount_won", amount)
    .lte("onnuri_started_at", new Date(postedAt.getTime() + MATCH_SKEW_MS).toISOString())
    .gte("onnuri_started_at", new Date(postedAt.getTime() - WAIT_MINUTES * 60_000).toISOString());
}

interface NotiRow {
  id: number;
  amount_won: number | null;
  posted_at: string;
  title: string | null;
  body: string | null;
  matched_order_id: number | null;
}

/** 이 주문과 맞을 수 있는 (아직 안 쓴) 알림들 */
async function candidateNotis(order: OnnuriOrderRow): Promise<NotiRow[]> {
  if (!order.onnuri_started_at) return [];
  const from = new Date(new Date(order.onnuri_started_at).getTime() - MATCH_SKEW_MS).toISOString();
  const to = order.onnuri_claimed_at
    ? new Date(new Date(order.onnuri_claimed_at).getTime() + MATCH_AFTER_CLAIM_MS).toISOString()
    : nowIso();
  const { data } = await supabase
    .from("crm_onnuri_notifications")
    .select("id, amount_won, posted_at, title, body, matched_order_id")
    .eq("center_id", order.center_id)
    .eq("amount_won", order.amount_won)
    .is("matched_order_id", null)
    .gte("posted_at", from)
    .lte("posted_at", to)
    .order("posted_at");
  return (data ?? []) as unknown as NotiRow[];
}

/** 이 알림과 맞을 수 있는 '결제했어요' 주문들 */
async function candidateOrders(centerId: number, amount: number, postedAt: Date): Promise<OnnuriOrderRow[]> {
  const { data } = await supabase
    .from("crm_orders")
    .select(ORDER_COLS)
    .eq("center_id", centerId)
    .eq("status", "pending")
    .eq("onnuri_state", "claimed")
    .eq("amount_won", amount)
    .lte("onnuri_started_at", new Date(postedAt.getTime() + MATCH_SKEW_MS).toISOString())
    .gte("onnuri_claimed_at", new Date(postedAt.getTime() - MATCH_AFTER_CLAIM_MS).toISOString());
  return (data ?? []) as unknown as OnnuriOrderRow[];
}

async function tryMatchOrder(order: OnnuriOrderRow): Promise<boolean> {
  if (order.onnuri_state !== "claimed") return false;
  const notis = await candidateNotis(order);
  if (notis.length !== 1) return false;
  const others = await candidateOrders(order.center_id, order.amount_won, new Date(notis[0].posted_at));
  if (others.length !== 1 || others[0].id !== order.id) return false;
  return (await linkAndComplete(order.center_id, order.id, notis[0].id, "auto")).ok;
}

async function tryMatchNotification(
  centerId: number,
  notiId: number,
  amount: number,
  postedAt: Date
): Promise<number | null> {
  const orders = await candidateOrders(centerId, amount, postedAt);
  if (orders.length !== 1) {
    if (orders.length > 1) {
      await supabase
        .from("crm_onnuri_notifications")
        .update({ match_note: `같은 금액 주문 ${orders.length}건 — 직원 확인 필요` } as never)
        .eq("id", notiId);
    }
    return null;
  }
  const notis = await candidateNotis(orders[0]);
  if (notis.length !== 1 || notis[0].id !== notiId) return null;
  const r = await linkAndComplete(centerId, orders[0].id, notiId, "auto");
  return r.ok ? orders[0].id : null;
}

/**
 * 알림을 주문에 연결하고 발급한다. 알림 선점(조건부 UPDATE)이 먼저라
 * 같은 알림이 두 주문을 발급시키는 일은 없다.
 */
async function linkAndComplete(
  centerId: number,
  orderId: number,
  notiId: number | null,
  by: string
): Promise<{ ok: boolean; error?: string }> {
  if (notiId) {
    const { data: took } = await supabase
      .from("crm_onnuri_notifications")
      .update({ matched_order_id: orderId, match_note: by === "auto" ? "자동 대조" : "직원 승인" } as never)
      .eq("id", notiId)
      .eq("center_id", centerId) // 다른 센터 알림은 연결 못 한다
      .is("matched_order_id", null)
      .select("id");
    if ((took ?? []).length === 0) return { ok: false, error: "이미 다른 주문에 연결됐거나 없는 알림이에요" };
  }
  const r = await completeOnnuriOrder(orderId, { by, notificationId: notiId });
  // 🚨 발급을 시작했으면(주문 선점 성공) 결제는 받은 것 — 발급 중 오류여도 알림 연결은 유지한다.
  //    주문은 '결제됨 + 실패 사유' 로 남아 직원이 보완한다(PG 결제와 같은 처리).
  if (!r.ok && !r.started && notiId) {
    await supabase
      .from("crm_onnuri_notifications")
      .update({ matched_order_id: null, match_note: `발급 실패: ${r.error ?? ""}`.slice(0, 200) } as never)
      .eq("id", notiId)
      .eq("matched_order_id", orderId);
  }
  return r;
}

/* ═══════════════════════ 발급 · 승인 · 거절 ═══════════════════════ */

async function completeOnnuriOrder(
  orderId: number,
  opts: { by: string; notificationId: number | null }
): Promise<{ ok: boolean; error?: string; started: boolean }> {
  const claim = await claimOrderForFulfillment(orderId);
  if (!claim.won) {
    return {
      ok: false,
      started: false,
      error:
        claim.reason === "already_done"
          ? "이미 발급된 주문이에요"
          : claim.reason === "in_progress"
            ? "지금 처리 중인 주문이에요"
            : "처리할 수 없는 주문이에요",
    };
  }
  const order = claim.order;
  const { data: m } = await supabase.from("crm_members").select("name").eq("id", order.member_id).maybeSingle();

  let result;
  try {
    result = await completeOrder({
      order,
      memberName: (m as { name?: string } | null)?.name ?? "회원",
      // 돈은 이미 받은 결제 — 발급이 막혀도 '결제됨' 으로 남겨 직원이 보완하게 한다
      pg: {
        method: "모바일 온누리",
        approvedAt: nowIso(),
        raw: { source: "onnuri", notification_id: opts.notificationId, by: opts.by },
      },
      payMethod: ONNURI_PAY,
    });
  } catch (e) {
    await releaseOrderClaim(orderId, "pending");
    return { ok: false, started: false, error: e instanceof Error ? e.message : "발급 실패" };
  }

  await supabase
    .from("crm_orders")
    .update({
      pg_provider: "onnuri",
      onnuri_state: opts.by === "auto" ? "matched" : "approved",
      onnuri_notification_id: opts.notificationId,
      onnuri_resolved_at: nowIso(),
      onnuri_resolved_by: opts.by,
      updated_at: nowIso(),
    } as never)
    .eq("id", orderId);

  return result.ok ? { ok: true, started: true } : { ok: false, started: true, error: result.error };
}

/** 직원 승인 — 알림을 골랐으면 그 알림과 연결해서 발급 */
export async function approveOnnuriOrder(
  centerId: number,
  orderId: number,
  actorUid: string,
  notificationId: number | null
): Promise<{ ok: boolean; error?: string }> {
  const order = await loadOnnuriOrder(orderId);
  if (!order || order.center_id !== centerId) return { ok: false, error: "주문을 찾을 수 없어요" };
  if (order.status !== "pending" || (order.onnuri_state !== "waiting" && order.onnuri_state !== "claimed")) {
    return { ok: false, error: "이미 처리된 주문이에요" };
  }
  return linkAndComplete(centerId, orderId, notificationId, actorUid);
}

/** 직원 거절 — 결제가 들어오지 않았다. 주문 취소 + 쿠폰 반환 + 임시 입장 종료 */
export async function rejectOnnuriOrder(
  centerId: number,
  orderId: number,
  actorUid: string,
  reason: string | null
): Promise<{ ok: boolean; error?: string }> {
  const order = await loadOnnuriOrder(orderId);
  if (!order || order.center_id !== centerId) return { ok: false, error: "주문을 찾을 수 없어요" };
  const { data } = await supabase
    .from("crm_orders")
    .update({
      status: "canceled",
      fail_reason: "온누리 결제 확인 안 됨",
      onnuri_state: "rejected",
      onnuri_reject_reason: reason?.slice(0, 300) ?? null,
      onnuri_resolved_at: nowIso(),
      onnuri_resolved_by: actorUid,
      updated_at: nowIso(),
    } as never)
    .eq("id", orderId)
    .eq("status", "pending")
    .in("onnuri_state", ["waiting", "claimed"])
    .select("id");
  if ((data ?? []).length === 0) return { ok: false, error: "이미 처리된 주문이에요" };
  if (order.coupon_issue_id) {
    const { releaseCoupon } = await import("@/app/lib/crm-coupons-server");
    await releaseCoupon(order.coupon_issue_id);
  }
  return { ok: true };
}

/* ═══════════════════════ 확인 필요 목록 · 알림 ═══════════════════════ */

export interface PendingOnnuriItem {
  orderId: number;
  memberId: number;
  memberName: string;
  memberPhone: string | null;
  productName: string;
  amountWon: number;
  state: "waiting" | "claimed";
  startedAt: string | null;
  claimedAt: string | null;
  /** 10분이 지나 직원 확인이 필요한 건 — 배너·알림 대상 */
  overdue: boolean;
  /** 같은 금액의 아직 안 쓴 공기계 알림 (승인할 때 고를 후보) */
  candidates: { id: number; amountWon: number | null; postedAt: string; text: string }[];
}

/**
 * 직원이 확인해야 할 온누리 주문.
 *  · claimed : 회원이 '결제했어요'를 눌렀는데 아직 못 맞춘 주문 (임시 입장 중)
 *  · waiting : 온누리를 고르기만 했는데, 같은 금액 알림이 이미 와 있는 주문
 *             (결제는 하고 '결제했어요'를 안 누르고 나간 경우)
 * overdue 는 10분이 지난 건 — 배너는 이것만 센다(정상 자동 대조가 끝나기 전에 깜빡이지 않게).
 */
export async function listPendingOnnuri(centerId: number): Promise<PendingOnnuriItem[]> {
  const { data } = await supabase
    .from("crm_orders")
    .select(ORDER_COLS)
    .eq("center_id", centerId)
    .eq("status", "pending")
    .in("onnuri_state", ["waiting", "claimed"])
    .order("onnuri_started_at", { ascending: true })
    .limit(100);
  const orders = (data ?? []) as unknown as OnnuriOrderRow[];
  if (orders.length === 0) return [];

  const memberIds = [...new Set(orders.map((o) => o.member_id))];
  const { data: mems } = await supabase.from("crm_members").select("id, name, phone").in("id", memberIds);
  const memMap = new Map(
    ((mems ?? []) as { id: number; name: string; phone: string | null }[]).map((m) => [m.id, m])
  );

  const cutoff = Date.now() - ALERT_AFTER_MINUTES * 60_000;
  const out: PendingOnnuriItem[] = [];
  for (const o of orders) {
    const candidates = await candidateNotis(o);
    const refTime = new Date(o.onnuri_claimed_at ?? o.onnuri_started_at ?? o.created_at).getTime();
    const old = refTime <= cutoff;
    // 고르기만 하고 결제 흔적도 없는 주문은 목록에 안 올린다 (그냥 떠난 회원 — 시간이 지나면 정리됨)
    if (o.onnuri_state === "waiting" && candidates.length === 0) continue;
    const m = memMap.get(o.member_id);
    out.push({
      orderId: o.id,
      memberId: o.member_id,
      memberName: m?.name ?? "회원",
      memberPhone: m?.phone ?? null,
      productName: o.product_name,
      amountWon: o.amount_won,
      state: o.onnuri_state as "waiting" | "claimed",
      startedAt: o.onnuri_started_at,
      claimedAt: o.onnuri_claimed_at,
      overdue: old,
      candidates: candidates.map((c) => ({
        id: c.id,
        amountWon: c.amount_won,
        postedAt: c.posted_at,
        text: [c.title, c.body].filter(Boolean).join(" · ").slice(0, 160),
      })),
    });
  }
  return out;
}

/** 확인 권한(sales.onnuri_confirm)이 있는 재직 직원에게 강사앱 푸시 */
async function notifyConfirmNeeded(item: PendingOnnuriItem, centerId: number) {
  const { data: staff } = await supabase
    .from("crm_center_members")
    .select("id, role, grade_id, is_solo_owner")
    .eq("center_id", centerId)
    .eq("status", "active");
  const { data: center } = await supabase.from("crm_centers").select("name").eq("id", centerId).maybeSingle();
  const centerName = (center as { name?: string } | null)?.name ?? "센터";
  for (const s of (staff ?? []) as { id: number; role: string; grade_id: number | null; is_solo_owner: boolean | null }[]) {
    const ok = await ctxHasPermission(
      { centerId, role: s.role, gradeId: s.grade_id ?? null, isSoloOwner: s.is_solo_owner ?? false } as CrmContext,
      "sales.onnuri_confirm"
    );
    if (!ok) continue;
    await notifyStaffMember({
      centerId,
      centerMemberId: s.id,
      type: "onnuri_confirm",
      title: `[${centerName}] 미수 · 온누리 결제 확인 요망`,
      body: `${item.memberName}님 ${item.productName} ${item.amountWon.toLocaleString("ko-KR")}원 — 결제를 확인하고 승인해 주세요`,
      data: { kind: "onnuri_confirm", order_id: String(item.orderId), member_id: String(item.memberId) },
    }).catch(() => {});
  }
}

/**
 * 10분이 지나도 못 맞춘 주문을 직원에게 알린다 (크론에서 10분마다).
 * alerted_at 을 조건부로 먼저 찍어 같은 주문이 두 번 알려지지 않게 한다.
 */
export async function alertOverdueOnnuri(): Promise<number> {
  const cutoff = new Date(Date.now() - ALERT_AFTER_MINUTES * 60_000).toISOString();
  const { data } = await supabase
    .from("crm_orders")
    .select("center_id")
    .eq("status", "pending")
    .in("onnuri_state", ["waiting", "claimed"])
    .is("onnuri_alerted_at", null)
    .lte("onnuri_started_at", cutoff)
    .limit(200);
  const centers = [...new Set(((data ?? []) as { center_id: number }[]).map((r) => r.center_id))];
  let sent = 0;
  for (const centerId of centers) {
    const items = (await listPendingOnnuri(centerId)).filter((i) => i.overdue);
    for (const item of items) {
      const { data: took } = await supabase
        .from("crm_orders")
        .update({ onnuri_alerted_at: nowIso() } as never)
        .eq("id", item.orderId)
        .is("onnuri_alerted_at", null)
        .select("id");
      if ((took ?? []).length === 0) continue;
      await notifyConfirmNeeded(item, centerId);
      sent++;
    }
  }
  return sent;
}

/* ═══════════════════════ 임시 입장 ═══════════════════════ */

/**
 * '결제했어요'를 누르고 확인을 기다리는 주문이 있으면 임시 입장 대상.
 * 직원이 거절하거나(rejected) 발급되면(matched/approved) 자동으로 빠진다.
 */
export async function onnuriTempEntry(
  centerId: number,
  memberId: number
): Promise<{ orderId: number; productName: string; amountWon: number } | null> {
  const since = new Date(Date.now() - TEMP_ENTRY_DAYS * 24 * 3600_000).toISOString();
  const { data } = await supabase
    .from("crm_orders")
    .select("id, product_name, amount_won")
    .eq("center_id", centerId)
    .eq("member_id", memberId)
    .eq("status", "pending")
    .eq("onnuri_state", "claimed")
    .gte("onnuri_claimed_at", since)
    .order("onnuri_claimed_at", { ascending: false })
    .limit(1);
  const row = ((data ?? [])[0] ?? null) as { id: number; product_name: string; amount_won: number } | null;
  return row ? { orderId: row.id, productName: row.product_name, amountWon: row.amount_won } : null;
}
