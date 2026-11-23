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
import { applyPgCancel } from "@/app/lib/crm-pg-cancel";
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
/**
 * 🚨 결제 한 번에 가맹점 앱 알림이 여러 개 온다 (실측: '결제되었어요' + '결제했어요' 0.04초 간격, 같은 금액).
 * 같은 기기·같은 금액·이 간격 안의 알림은 **결제 1건**으로 묶는다. 안 묶으면 후보가 2건이 돼 자동 발급이 멈춘다.
 * 한 카운터 QR 로 같은 금액 결제 2건이 15초 안에 연달아 나오는 일은 사실상 없다.
 */
const SAME_PAYMENT_MS = 15_000;

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
/** 결제 취소 알림 — 직원이 확인하고 CRM 환불로 이어간다 */
export const CANCEL_RE = /취소|환불/;
/** 결제가 아닌 알림 — 취소·환불·실패·거절·오류 */
export const NON_PAYMENT_RE = /취소|환불|실패|거절|오류|불가|반려/;

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
export async function startOnnuri(
  order: OnnuriOrderRow
): Promise<{ ok: boolean; error?: string; /** 이번 요청으로 처음 신청됨 — 신청 알림은 이때 한 번만 */ started?: boolean }> {
  if (order.status !== "pending") return { ok: false, error: "결제를 진행할 수 없는 주문이에요" };
  if (order.onnuri_state === "waiting" || order.onnuri_state === "claimed") return { ok: true, started: false };
  if (order.amount_won <= 0) return { ok: false, error: "결제할 금액이 없어요" };
  const { data: took, error } = await supabase
    .from("crm_orders")
    .update({
      onnuri_state: "waiting",
      onnuri_started_at: nowIso(),
      expires_at: new Date(Date.now() + WAIT_MINUTES * 60_000).toISOString(),
      updated_at: nowIso(),
    } as never)
    .eq("id", order.id)
    .eq("status", "pending")
    // 두 번 눌러도 신청 알림이 한 번만 가게 — 아직 신청 전인 주문만 바꾼다
    .is("onnuri_state", null)
    .select("id");
  if (error) return { ok: false, error: "저장하지 못했어요" };
  return { ok: true, started: (took ?? []).length > 0 };
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
  // 🚨 취소·환불·실패 알림도 금액이 들어 있다 — 결제로 읽으면 돈 안 낸 주문이 발급될 수 있다.
  //    amount_won(결제 후보 금액)은 비우고, 취소 알림은 cancel_amount_won 에 따로 담아
  //    직원 확인 목록(배너)에 올린다. 실패·오류 알림은 기록만.
  const fullText = `${n.title}\n${n.text}`;
  const kind: "payment" | "cancel" | "other" = CANCEL_RE.test(fullText)
    ? "cancel"
    : NON_PAYMENT_RE.test(fullText)
      ? "other"
      : "payment";
  const nonPayment = kind !== "payment";
  const amount = nonPayment ? null : parseAmountWon(fullText);
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
      kind,
      cancel_amount_won: kind === "cancel" ? parseAmountWon(fullText) : null,
      cancel_state: kind === "cancel" ? "open" : null,
      match_note: kind === "cancel" ? "결제 취소 알림 — 환불 확인 필요" : kind === "other" ? "실패·오류 알림 (결제 아님)" : null,
    } as never)
    .select("id")
    .maybeSingle();
  // 같은 알림 재전송 → 유니크 제약으로 무시
  if (error || !data) return { saved: false, amountWon: amount, matchedOrderId: null };
  const id = (data as { id: number }).id;
  if (kind === "cancel") await notifyCancelArrived(device, id, postedAt);
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
  device_id: number;
  amount_won: number | null;
  posted_at: string;
  title: string | null;
  body: string | null;
  matched_order_id: number | null;
  /** 같은 결제로 묶인 알림 id 전부 (대표 id 포함) */
  ids: number[];
}

/** 같은 결제에서 나온 알림들을 1건으로 묶는다 — 대표는 가장 먼저 온 알림 */
function groupSamePayment(rows: Omit<NotiRow, "ids">[]): NotiRow[] {
  const out: (NotiRow & { lastAt: number })[] = [];
  for (const r of rows) {
    const at = new Date(r.posted_at).getTime();
    const g = out.find(
      (x) => x.device_id === r.device_id && x.amount_won === r.amount_won && at - x.lastAt <= SAME_PAYMENT_MS
    );
    if (g) {
      g.ids.push(r.id);
      g.lastAt = at;
      if (r.title && !g.title?.includes(r.title)) g.title = [g.title, r.title].filter(Boolean).join(" / ");
    } else {
      out.push({ ...r, ids: [r.id], lastAt: at });
    }
  }
  return out.map((g) => ({
    id: g.id,
    device_id: g.device_id,
    amount_won: g.amount_won,
    posted_at: g.posted_at,
    title: g.title,
    body: g.body,
    matched_order_id: g.matched_order_id,
    ids: g.ids,
  }));
}

/** 이 주문과 맞을 수 있는 (아직 안 쓴) 결제 알림들 — 같은 결제의 알림 여러 개는 1건 */
async function candidateNotis(order: OnnuriOrderRow): Promise<NotiRow[]> {
  if (!order.onnuri_started_at) return [];
  const from = new Date(new Date(order.onnuri_started_at).getTime() - MATCH_SKEW_MS).toISOString();
  const to = order.onnuri_claimed_at
    ? new Date(new Date(order.onnuri_claimed_at).getTime() + MATCH_AFTER_CLAIM_MS).toISOString()
    : nowIso();
  const { data } = await supabase
    .from("crm_onnuri_notifications")
    .select("id, device_id, amount_won, posted_at, title, body, matched_order_id")
    .eq("center_id", order.center_id)
    .eq("amount_won", order.amount_won)
    .is("matched_order_id", null)
    .gte("posted_at", from)
    .lte("posted_at", to)
    .order("posted_at");
  return groupSamePayment((data ?? []) as unknown as Omit<NotiRow, "ids">[]);
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

/**
 * '결제했어요' 주문을 다시 대조한다 — 결제 화면이 상태를 확인할 때마다 부른다.
 * 알림이 늦게 왔거나 대조 규칙이 바뀐 뒤에도, 화면을 열어 둔 회원은 따로 처리 없이 발급된다.
 */
export async function retryOnnuriMatch(order: OnnuriOrderRow): Promise<boolean> {
  if (order.status !== "pending" || order.onnuri_state !== "claimed") return false;
  return tryMatchOrder(order);
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
  if (notis.length !== 1 || !notis[0].ids.includes(notiId)) return null;
  const r = await linkAndComplete(centerId, orders[0].id, notis[0].id, "auto");
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
    await linkSiblings(centerId, orderId, notiId);
  }
  const r = await completeOnnuriOrder(orderId, { by, notificationId: notiId });
  // 🚨 발급을 시작했으면(주문 선점 성공) 결제는 받은 것 — 발급 중 오류여도 알림 연결은 유지한다.
  //    주문은 '결제됨 + 실패 사유' 로 남아 직원이 보완한다(PG 결제와 같은 처리).
  if (!r.ok && !r.started && notiId) {
    await supabase
      .from("crm_onnuri_notifications")
      .update({ matched_order_id: null, match_note: `발급 실패: ${r.error ?? ""}`.slice(0, 200) } as never)
      .eq("center_id", centerId)
      .eq("matched_order_id", orderId);
  }
  return r;
}

/** 대표 알림과 같은 결제에서 나온 나머지 알림도 같은 주문에 붙인다 (다른 주문 후보로 남지 않게) */
async function linkSiblings(centerId: number, orderId: number, notiId: number) {
  const { data: head } = await supabase
    .from("crm_onnuri_notifications")
    .select("device_id, amount_won, posted_at")
    .eq("id", notiId)
    .maybeSingle();
  const h = head as { device_id: number; amount_won: number | null; posted_at: string } | null;
  if (!h || !h.amount_won) return;
  const at = new Date(h.posted_at).getTime();
  await supabase
    .from("crm_onnuri_notifications")
    .update({ matched_order_id: orderId, match_note: "같은 결제 알림" } as never)
    .eq("center_id", centerId)
    .eq("device_id", h.device_id)
    .eq("amount_won", h.amount_won)
    .is("matched_order_id", null)
    .gte("posted_at", new Date(at - SAME_PAYMENT_MS).toISOString())
    .lte("posted_at", new Date(at + SAME_PAYMENT_MS).toISOString());
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
  await pushConfirmers(
    centerId,
    (centerName) => `[${centerName}] 미수 · 온누리 결제 확인 요망`,
    `${item.memberName}님 ${item.productName} ${item.amountWon.toLocaleString("ko-KR")}원 — 결제를 확인하고 승인해 주세요`,
    "onnuri_confirm",
    { order_id: String(item.orderId), member_id: String(item.memberId) }
  );
}

async function pushConfirmers(
  centerId: number,
  title: (centerName: string) => string,
  body: string,
  type: string,
  extra: Record<string, string>
) {
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
      type,
      title: title(centerName),
      body,
      data: { kind: type, ...extra },
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


/* ═══════════════════════ 가맹점 앱에서 결제 취소 → CRM 환불 ═══════════════════════ */
/*
 * 가맹점 앱에서 결제를 취소하면 '결제가 취소되었어요' 알림이 온다. 알림에는 금액만 있고
 * 어느 주문인지 번호가 없으므로 **자동으로 환불하지 않는다** (사장님 결정 2026-11-23).
 * 같은 금액의 온누리 결제 주문을 후보로 보여주고 직원이 골라 [환불 처리] 한다.
 * 환불은 토스·이니시스 취소와 같은 applyPgCancel 로 — 회원권·묶음 구성품·마일리지·쿠폰·회원 알림까지.
 */

/** 취소 알림과 연결할 수 있는 온누리 주문을 찾는 기간 */
const CANCEL_LOOKBACK_DAYS = 30;

export interface OnnuriCancelItem {
  /** 대표 취소 알림 id (같은 취소의 알림 여러 개는 1건) */
  notificationId: number;
  amountWon: number | null;
  postedAt: string;
  text: string;
  candidates: {
    orderId: number;
    memberId: number;
    memberName: string;
    productName: string;
    amountWon: number;
    paidAt: string | null;
  }[];
}

interface CancelRow {
  id: number;
  device_id: number;
  cancel_amount_won: number | null;
  posted_at: string;
  title: string | null;
  body: string | null;
}

export async function listOnnuriCancels(centerId: number): Promise<OnnuriCancelItem[]> {
  const { data } = await supabase
    .from("crm_onnuri_notifications")
    .select("id, device_id, cancel_amount_won, posted_at, title, body")
    .eq("center_id", centerId)
    .eq("cancel_state", "open")
    .order("posted_at")
    .limit(50);
  const rows = (data ?? []) as unknown as CancelRow[];
  // 같은 취소에서 나온 알림 여러 개는 1건으로
  const heads: CancelRow[] = [];
  for (const r of rows) {
    const at = new Date(r.posted_at).getTime();
    const dup = heads.find(
      (h) =>
        h.device_id === r.device_id &&
        h.cancel_amount_won === r.cancel_amount_won &&
        Math.abs(at - new Date(h.posted_at).getTime()) <= SAME_PAYMENT_MS
    );
    if (!dup) heads.push(r);
  }

  const out: OnnuriCancelItem[] = [];
  for (const h of heads) {
    const posted = new Date(h.posted_at).getTime();
    let q = supabase
      .from("crm_orders")
      .select("id, member_id, product_name, amount_won, pg_approved_at")
      .eq("center_id", centerId)
      .eq("pg_provider", "onnuri")
      .eq("status", "paid")
      .gte("pg_approved_at", new Date(posted - CANCEL_LOOKBACK_DAYS * 86400_000).toISOString())
      .lte("pg_approved_at", new Date(posted + MATCH_SKEW_MS).toISOString())
      .order("pg_approved_at", { ascending: false })
      .limit(20);
    // 금액을 못 읽었으면 금액 조건 없이 최근 온누리 결제를 보여준다
    if (h.cancel_amount_won) q = q.eq("amount_won", h.cancel_amount_won);
    const { data: ords } = await q;
    const orders = (ords ?? []) as unknown as {
      id: number;
      member_id: number;
      product_name: string;
      amount_won: number;
      pg_approved_at: string | null;
    }[];
    const memberIds = [...new Set(orders.map((o) => o.member_id))];
    const { data: mems } = memberIds.length
      ? await supabase.from("crm_members").select("id, name").in("id", memberIds)
      : { data: [] };
    const names = new Map(((mems ?? []) as { id: number; name: string }[]).map((m) => [m.id, m.name]));
    out.push({
      notificationId: h.id,
      amountWon: h.cancel_amount_won,
      postedAt: h.posted_at,
      text: [h.title, h.body].filter(Boolean).join(" · ").slice(0, 160),
      candidates: orders.map((o) => ({
        orderId: o.id,
        memberId: o.member_id,
        memberName: names.get(o.member_id) ?? "회원",
        productName: o.product_name,
        amountWon: o.amount_won,
        paidAt: o.pg_approved_at,
      })),
    });
  }
  return out;
}

/** 대표 취소 알림과 같은 취소에서 나온 나머지 알림도 같이 정리한다 */
async function resolveCancelSiblings(
  centerId: number,
  head: CancelRow,
  patch: Record<string, unknown>
) {
  const at = new Date(head.posted_at).getTime();
  let q = supabase
    .from("crm_onnuri_notifications")
    .update(patch as never)
    .eq("center_id", centerId)
    .eq("device_id", head.device_id)
    .eq("cancel_state", "open")
    .gte("posted_at", new Date(at - SAME_PAYMENT_MS).toISOString())
    .lte("posted_at", new Date(at + SAME_PAYMENT_MS).toISOString());
  q = head.cancel_amount_won ? q.eq("cancel_amount_won", head.cancel_amount_won) : q.is("cancel_amount_won", null);
  await q;
}

async function loadOpenCancel(centerId: number, notiId: number): Promise<CancelRow | null> {
  const { data } = await supabase
    .from("crm_onnuri_notifications")
    .select("id, device_id, cancel_amount_won, posted_at, title, body")
    .eq("id", notiId)
    .eq("center_id", centerId)
    .eq("cancel_state", "open")
    .maybeSingle();
  return (data as unknown as CancelRow | null) ?? null;
}

/** 직원이 고른 온누리 주문을 환불 처리한다 (회원권 회수까지) */
export async function refundOnnuriCancel(
  centerId: number,
  notiId: number,
  orderId: number,
  actorUid: string
): Promise<{ ok: boolean; error?: string; note?: string }> {
  const head = await loadOpenCancel(centerId, notiId);
  if (!head) return { ok: false, error: "이미 처리된 취소 알림이에요" };

  const { data: o } = await supabase
    .from("crm_orders")
    .select("id, center_id, member_id, amount_won, status, coupon_issue_id, pg_provider")
    .eq("id", orderId)
    .eq("center_id", centerId)
    .maybeSingle();
  const order = o as {
    id: number;
    center_id: number;
    member_id: number;
    amount_won: number;
    status: string;
    coupon_issue_id: number | null;
    pg_provider: string;
  } | null;
  if (!order || order.pg_provider !== "onnuri") return { ok: false, error: "온누리 결제 주문이 아니에요" };
  if (order.status !== "paid") return { ok: false, error: "이미 환불됐거나 결제가 끝나지 않은 주문이에요" };

  // 선점 — 같은 취소 알림으로 두 번 환불하지 않게
  const resolved = {
    cancel_state: "refunded",
    cancel_order_id: orderId,
    cancel_resolved_at: nowIso(),
    cancel_resolved_by: actorUid,
  };
  const { data: took } = await supabase
    .from("crm_onnuri_notifications")
    .update({ ...resolved, match_note: "환불 처리" } as never)
    .eq("id", notiId)
    .eq("cancel_state", "open")
    .select("id");
  if ((took ?? []).length === 0) return { ok: false, error: "이미 처리된 취소 알림이에요" };

  const cancelWon = head.cancel_amount_won && head.cancel_amount_won < order.amount_won ? head.cancel_amount_won : order.amount_won;
  const r = await applyPgCancel({
    order: {
      id: order.id,
      center_id: order.center_id,
      member_id: order.member_id,
      amount_won: order.amount_won,
      status: order.status,
      coupon_issue_id: order.coupon_issue_id,
    },
    provider: "onnuri",
    cancel: {
      canceled: true,
      isPartial: cancelWon < order.amount_won,
      canceledAmountWon: cancelWon,
      refundedAt: head.posted_at,
      reason: "온누리 가맹점 앱에서 결제 취소",
      txKey: `onnuri-cancel:${notiId}`,
    },
  });
  if (!r.ok) {
    await supabase
      .from("crm_onnuri_notifications")
      .update({
        cancel_state: "open",
        cancel_order_id: null,
        cancel_resolved_at: null,
        cancel_resolved_by: null,
        match_note: `환불 실패: ${r.note}`.slice(0, 200),
      } as never)
      .eq("id", notiId);
    return { ok: false, error: r.note };
  }
  await resolveCancelSiblings(centerId, head, { ...resolved, match_note: "같은 취소 알림" });
  await supabase.from("crm_audit_logs").insert({
    center_id: centerId,
    actor_uid: actorUid,
    action: "onnuri.cancel_refund",
    entity_type: "crm_orders",
    entity_id: orderId,
    payload: { member_id: order.member_id, 환불금액: cancelWon, 처리경로: "온누리 가맹점 앱 결제 취소 → CRM 환불", 결과: r.note } as never,
  });
  return { ok: true, note: r.note };
}

/** 이 취소는 온라인 주문과 관계없음 (카운터에서 직접 받은 결제 등) — 목록에서 내린다 */
export async function dismissOnnuriCancel(
  centerId: number,
  notiId: number,
  actorUid: string
): Promise<{ ok: boolean; error?: string }> {
  const head = await loadOpenCancel(centerId, notiId);
  if (!head) return { ok: false, error: "이미 처리된 취소 알림이에요" };
  await resolveCancelSiblings(centerId, head, {
    cancel_state: "dismissed",
    cancel_resolved_at: nowIso(),
    cancel_resolved_by: actorUid,
    match_note: "관계없음 처리",
  });
  return { ok: true };
}

/**
 * 가맹점 앱에서 결제가 취소됐다 → 확인 권한 직원에게 '환불 처리해 주세요' 푸시.
 * 취소 1건에 알림이 여러 개 올 수 있어, 15초 안에 먼저 온 같은 기기의 취소 알림이 있으면 보내지 않는다.
 */
async function notifyCancelArrived(device: OnnuriDevice, notiId: number, postedAt: Date) {
  try {
    const { data: earlier } = await supabase
      .from("crm_onnuri_notifications")
      .select("id")
      .eq("device_id", device.id)
      .eq("kind", "cancel")
      .lt("id", notiId)
      .gte("posted_at", new Date(postedAt.getTime() - SAME_PAYMENT_MS).toISOString())
      .limit(1);
    if ((earlier ?? []).length > 0) return;
    const item = (await listOnnuriCancels(device.center_id)).find((c) => c.notificationId === notiId);
    if (!item) return;
    const won = item.amountWon ? `${item.amountWon.toLocaleString("ko-KR")}원` : "금액 미확인";
    const who =
      item.candidates.length === 1
        ? `${item.candidates[0].memberName}님 ${item.candidates[0].productName} ${won}`
        : won;
    await pushConfirmers(
      device.center_id,
      (centerName) => `[${centerName}] 온누리 결제 취소됨`,
      `${who} 결제가 가맹점 앱에서 취소됐어요 — CRM에서 환불 처리해 주세요`,
      "onnuri_cancel",
      {
        notification_id: String(notiId),
        ...(item.candidates.length === 1 ? { member_id: String(item.candidates[0].memberId) } : {}),
      }
    );
  } catch {
    /* 푸시 실패가 알림 수신을 막지 않게 */
  }
}
