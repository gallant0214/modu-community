/**
 * 회원앱 구매 이행(fulfillment) — 결제가 **서버에서 확인된 뒤** 상품을 실제로 발급한다.
 *
 * 직원 발급 라우트(/api/crm/passes 등)는 직원 컨텍스트·권한에 묶여 있어 그대로 못 쓰고,
 * 돈이 오가는 기존 경로를 건드리지 않으려고 발급을 여기 따로 구현했다.
 * 저장 형태(컬럼·기본값)는 직원 발급과 동일하게 맞춰져 있다.
 *
 * 상품 유형별 귀착지
 *   membership            → crm_memberships
 *   personal/group/class  → crm_passes   (class 는 product_id 로 구분)
 *   apparel               → crm_rentals
 *   locker                → crm_rentals (+ 기존 배정 락커가 있으면 기간 연장)
 *                           신규 자리 배정은 직원이 한다 → memo "구역 미배정"
 *   goods                 → 발급물 없음(물품 판매). 결제 기록만 남긴다
 *
 * 🚨 모르는 유형은 수강권으로 흘려보내지 않고 예외를 던진다(잘못된 발급 방지).
 */
import { supabase } from "@/app/lib/supabase";
import { computeExpiryYmd, unitToDays } from "@/app/lib/duration-convert";
import { computeNextStart } from "@/app/lib/next-start";

/** 횟수제처럼 만료 개념이 없을 때 쓰는 표준 sentinel (무기한) */
const UNLIMITED_EXPIRY = "9999-12-31";

export function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export interface SellableProduct {
  id: number;
  center_id: number;
  type: string;
  billing_mode: string;
  name: string;
  description: string | null;
  price_won: number;
  vat_included: boolean;
  duration_value: number | null;
  duration_unit: string | null;
  total_sessions: number | null;
  session_minutes: number | null;
  capacity: number | null;
  mileage_earn: number;
  attendance_mileage_earn: number;
  status: string;
  sale_enabled: boolean;
}

export const PRODUCT_SELECT =
  "id, center_id, type, billing_mode, name, description, price_won, vat_included, " +
  "duration_value, duration_unit, total_sessions, session_minutes, capacity, " +
  "mileage_earn, attendance_mileage_earn, status, sale_enabled";

/** 앱에서 발급 처리가 구현된 유형만 판매한다 */
const APP_SELLABLE_TYPES = new Set([
  "membership",
  "personal",
  "group",
  "class",
  "apparel",
  "locker",
  "goods",
]);

/** 앱에서 팔 수 있는 상품인지 — 판매 스위치 ON + 활성 + 가격 있음 + 발급 가능한 유형 */
export function isSellable(p: SellableProduct): boolean {
  return (
    p.sale_enabled === true &&
    p.status === "active" &&
    Number(p.price_won) > 0 &&
    APP_SELLABLE_TYPES.has(p.type)
  );
}

/** 이용권 발급 대상이 아닌 유형(물품 등) */
export const NO_ISSUE_TYPES = new Set(["goods"]);
/** 수강권으로 발급되는 유형 */
const PASS_TYPES = new Set(["personal", "group", "class"]);

export interface FulfillOutcome {
  /** none = 발급물 없이 판매 기록만 (물품) */
  kind: "membership" | "pass" | "rental" | "none";
  id: number;
  /** 화면에 보여줄 요약 (시작일·만료일 등) */
  summary: { startDate: string; expiresAt: string; sessions?: number | null };
  extra?: Record<string, unknown>;
}

/**
 * 결제가 확인된 주문을 실제 상품으로 발급한다.
 * 이 함수를 호출하기 전에 **반드시 PG 서버 승인 확인이 끝나 있어야 한다.**
 */
export async function fulfillPurchase(opts: {
  centerId: number;
  memberId: number;
  product: SellableProduct;
  /** 실제 결제된 금액(원) — 쿠폰·마일리지를 뺀 최종가 */
  amountWon: number;
  /** 쿠폰 할인액 — 상품 행의 discount_won 에 남긴다 */
  discountWon?: number;
  /** 마일리지 사용액 — 잔고 반영은 settleOrderMileage() 가 따로 한다 */
  mileageUsed?: number;
  /** 구매 적립 마일리지 — 잔고 반영은 settleOrderMileage() 가 따로 한다 */
  mileageEarn?: number;
  /** PG 가 알려준 결제 수단 문구 (메모용) */
  pgMethod?: string | null;
}): Promise<FulfillOutcome> {
  const { centerId, memberId, product } = opts;
  const today = kstToday();
  const isCount = product.billing_mode === "count";
  const discountWon = Math.max(0, Math.floor(opts.discountWon || 0));
  const mileageUsed = Math.max(0, Math.floor(opts.mileageUsed || 0));
  const mileageEarned = Math.max(
    0,
    Math.floor(opts.mileageEarn ?? product.mileage_earn ?? 0)
  );

  // 회원권/운동복/락커는 기존 이용권 뒤로 이어붙인다(수강권은 이어붙이기 대상 아님)
  const chainType =
    product.type === "membership" ? "membership" : product.type === "apparel" ? "apparel" : product.type === "locker" ? "locker" : null;
  const startDate = chainType
    ? (await computeNextStart(centerId, memberId, chainType)).start_date
    : today;

  const expiresAt = isCount
    ? UNLIMITED_EXPIRY
    : computeExpiryYmd(startDate, product.duration_value ?? 0, product.duration_unit ?? "day");

  const memo = `회원앱 구매${opts.pgMethod ? ` (${opts.pgMethod})` : ""}`;

  /* ── 물품 — 발급물 없이 판매 기록만 ─────────── */
  if (NO_ISSUE_TYPES.has(product.type)) {
    return { kind: "none", id: 0, summary: { startDate: today, expiresAt: today } };
  }

  /* ── 회원권 ───────────────────────────────── */
  if (product.type === "membership") {
    const { data, error } = await supabase
      .from("crm_memberships")
      .insert({
        center_id: centerId,
        member_id: memberId,
        seller_member_id: null,
        plan_name: product.name,
        duration_days: unitToDays(product.duration_value, product.duration_unit) || 30,
        price_won: opts.amountWon,
        discount_won: discountWon,
        mileage_earned: mileageEarned,
        mileage_used: mileageUsed,
        attendance_mileage_earn: Math.max(0, Math.floor(product.attendance_mileage_earn || 0)),
        vat_included: !!product.vat_included,
        payment_method: "card",
        start_date: startDate,
        expires_at: expiresAt,
        purchased_at: today,
        status: "valid",
        memo,
        outstanding_won: 0,
        payment_status: "paid",
      } as never)
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message || "회원권 발급 실패");
    return {
      kind: "membership",
      id: (data as { id: number }).id,
      summary: { startDate, expiresAt },
    };
  }

  /* ── 운동복·락커 (대여권) ─────────────────── */
  if (product.type === "apparel" || product.type === "locker") {
    const isLocker = product.type === "locker";
    // 락커는 이미 배정받은 자리가 있으면 그 자리를 그대로 연장한다
    let existingLocker: { id: number; number: number } | null = null;
    if (isLocker) {
      const { data } = await supabase
        .from("crm_lockers")
        .select("id, number, expires_at")
        .eq("center_id", centerId)
        .eq("assigned_member_id", memberId)
        .eq("state", "assigned")
        .order("expires_at", { ascending: false })
        .limit(1);
      existingLocker = (data?.[0] as { id: number; number: number } | undefined) ?? null;
    }

    const { data, error } = await supabase
      .from("crm_rentals")
      .insert({
        center_id: centerId,
        member_id: memberId,
        seller_member_id: null,
        item_name: product.name,
        price_won: opts.amountWon,
        discount_won: discountWon,
        mileage_earned: mileageEarned,
        mileage_used: mileageUsed,
        vat_included: !!product.vat_included,
        payment_method: "card",
        start_date: startDate,
        expires_at: expiresAt,
        status: "valid",
        memo: isLocker
          ? existingLocker
            ? `${existingLocker.number}번 · ${memo}`
            : `구역 미배정 · ${memo}`
          : memo,
      } as never)
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message || "발급 실패");

    // 기존 락커 자리를 새 만료일까지 연장 (신규 배정은 직원이 처리)
    if (isLocker && existingLocker) {
      await supabase
        .from("crm_lockers")
        .update({ expires_at: expiresAt } as never)
        .eq("id", existingLocker.id);
    }

    return {
      kind: "rental",
      id: (data as { id: number }).id,
      summary: { startDate, expiresAt },
      extra: isLocker
        ? { lockerAssigned: !!existingLocker, lockerNumber: existingLocker?.number ?? null }
        : undefined,
    };
  }

  /* ── 수강권 (개인/그룹/클래스) ────────────── */
  if (!PASS_TYPES.has(product.type)) {
    // 새 상품 유형이 생겼는데 여기 분기를 안 만든 경우 — 조용히 잘못 발급하느니 막는다
    throw new Error(`앱에서 발급할 수 없는 상품 유형입니다 (${product.type})`);
  }
  const totalSessions = isCount ? Math.max(1, Math.floor(product.total_sessions ?? 1)) : 0;
  const { data, error } = await supabase
    .from("crm_passes")
    .insert({
      center_id: centerId,
      member_id: memberId,
      trainer_member_id: null, // 담당 강사는 센터가 나중에 배정
      co_trainer_ids: [],
      seller_member_id: null,
      issue_type: "new",
      lesson_kind: product.name,
      total_sessions: totalSessions,
      remaining_sessions: totalSessions,
      session_minutes: Math.max(0, Math.floor(product.session_minutes ?? 50)),
      price_won: opts.amountWon,
      discount_won: discountWon,
      mileage_earned: mileageEarned,
      mileage_used: mileageUsed,
      payment_method: "card",
      vat_included: !!product.vat_included,
      issued_at: today,
      start_date: startDate,
      expires_at: expiresAt,
      status: "valid",
      memo,
      outstanding_won: 0,
      payment_status: "paid",
      product_id: product.id,
      group_capacity: Math.max(1, Math.floor(product.capacity ?? 1)),
      attendance_mileage_earn: Math.max(0, Math.floor(product.attendance_mileage_earn || 0)),
    } as never)
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message || "수강권 발급 실패");

  return {
    kind: "pass",
    id: (data as { id: number }).id,
    summary: { startDate, expiresAt, sessions: totalSessions || null },
  };
}

/** 발급 결과에 맞춰 결제 원장(crm_payments)에 기록 */
export async function recordPayment(opts: {
  centerId: number;
  memberId: number;
  orderId: number;
  amountWon: number;
  outcome: FulfillOutcome;
  note?: string;
}): Promise<number | null> {
  const { data } = await supabase
    .from("crm_payments")
    .insert({
      center_id: opts.centerId,
      member_id: opts.memberId,
      pass_id: opts.outcome.kind === "pass" ? opts.outcome.id : null,
      membership_id: opts.outcome.kind === "membership" ? opts.outcome.id : null,
      rental_id: opts.outcome.kind === "rental" ? opts.outcome.id : null,
      amount_won: opts.amountWon,
      method: "card",
      paid_at: new Date().toISOString(),
      recorded_by_uid: null,
      note: opts.note ?? "회원앱 구매",
      status: "completed",
      order_id: opts.orderId,
      source: "member_app",
    } as never)
    .select("id")
    .single();
  return (data as { id: number } | null)?.id ?? null;
}
