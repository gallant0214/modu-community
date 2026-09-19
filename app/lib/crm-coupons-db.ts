/**
 * 쿠폰 API 공용 조회 헬퍼 (서버 전용).
 */
import { supabase } from "@/app/lib/supabase";
import { kstTodayYmd, PRODUCT_TYPE_LABEL, type CouponDef } from "@/app/lib/crm-coupons";

/** Supabase 기본 1000행 제한 회피 — range 페이지네이션 */
export async function paginateAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < 200; page++) {
    const from = page * 1000;
    const { data, error } = await build(from, from + 999);
    if (error || !Array.isArray(data)) break;
    out.push(...(data as T[]));
    if (data.length < 1000) break;
  }
  return out;
}

/** 쿠폰 정의 + 증정 상품 이름 */
export async function loadCoupons(centerId: number, ids?: number[]): Promise<Map<number, CouponDef>> {
  let q = supabase.from("crm_coupons").select("*").eq("center_id", centerId);
  if (ids) {
    if (ids.length === 0) return new Map();
    q = q.in("id", ids);
  }
  const { data } = await q;
  const list = (data ?? []) as unknown as CouponDef[];
  const giftIds = Array.from(new Set(list.map((c) => c.gift_product_id).filter(Boolean))) as number[];
  if (giftIds.length) {
    const { data: prods } = await supabase.from("crm_products").select("id, name").in("id", giftIds);
    const nameOf = new Map(((prods ?? []) as { id: number; name: string }[]).map((p) => [p.id, p.name]));
    for (const c of list) if (c.gift_product_id) c.gift_product_name = nameOf.get(c.gift_product_id) ?? null;
  }
  return new Map(list.map((c) => [Number(c.id), c]));
}

/** 회원 id → 이름·전화 */
export async function loadMemberNames(
  centerId: number,
  ids: number[]
): Promise<Map<number, { name: string; phone: string | null }>> {
  const out = new Map<number, { name: string; phone: string | null }>();
  const uniq = Array.from(new Set(ids));
  for (let i = 0; i < uniq.length; i += 500) {
    const { data } = await supabase
      .from("crm_members")
      .select("id, name, phone")
      .eq("center_id", centerId)
      .in("id", uniq.slice(i, i + 500));
    for (const m of (data ?? []) as { id: number; name: string; phone: string | null }[]) {
      out.set(m.id, { name: m.name, phone: m.phone });
    }
  }
  return out;
}

/** 입력 검증 — 생성·수정 공용 */
export function validateCouponInput(b: Record<string, unknown>): { error?: string; row?: Record<string, unknown> } {
  const name = String(b.name ?? "").trim();
  if (!name) return { error: "쿠폰 이름을 입력해 주세요" };
  if (name.length > 40) return { error: "쿠폰 이름은 40자 이내로 입력해 주세요" };
  const type = String(b.benefit_type ?? "");
  if (!["amount", "percent", "gift"].includes(type)) return { error: "혜택 종류를 선택해 주세요" };

  const int = (v: unknown) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const row: Record<string, unknown> = {
    name,
    description: String(b.description ?? "").trim().slice(0, 300) || null,
    benefit_type: type,
    amount_won: null,
    percent: null,
    max_discount_won: null,
    gift_product_id: null,
    min_purchase_won: Math.max(0, Math.floor(Number(b.min_purchase_won) || 0)),
    applicable_types:
      Array.isArray(b.applicable_types) && b.applicable_types.length > 0
        ? (b.applicable_types as unknown[]).map(String).filter((t) => t in PRODUCT_TYPE_LABEL)
        : null,
    one_per_member: !!b.one_per_member,
  };

  if (type === "amount") {
    row.amount_won = int(b.amount_won);
    if (!row.amount_won) return { error: "할인 금액을 입력해 주세요" };
  } else if (type === "percent") {
    const p = Number(b.percent);
    if (!Number.isFinite(p) || p <= 0 || p > 100) return { error: "할인율은 1~100% 사이로 입력해 주세요" };
    row.percent = Math.round(p * 100) / 100;
    row.max_discount_won = int(b.max_discount_won);
  } else {
    row.gift_product_id = int(b.gift_product_id);
    if (!row.gift_product_id) return { error: "증정할 상품을 선택해 주세요" };
    row.min_purchase_won = 0;
    row.applicable_types = null;
  }

  const mode = b.valid_mode === "until" ? "until" : "days";
  row.valid_mode = mode;
  if (mode === "days") {
    const d = int(b.valid_days);
    if (!d || d > 3650) return { error: "유효기간(일)을 1~3650 사이로 입력해 주세요" };
    row.valid_days = d;
    row.valid_until = null;
  } else {
    const until = String(b.valid_until ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) return { error: "만료일을 선택해 주세요" };
    if (until < kstTodayYmd()) return { error: "만료일은 오늘 이후여야 해요" };
    row.valid_until = until;
    row.valid_days = null;
  }
  return { row };
}


/** 쿠폰이 쓰인 결제(수강권/회원권/대여권) → 상품명 */
export async function loadUsedRefNames(
  refs: { kind: string | null; id: number | null }[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const group = (k: string) =>
    Array.from(new Set(refs.filter((r) => r.kind === k && r.id).map((r) => Number(r.id))));
  const passIds = group("pass");
  const memIds = group("membership");
  const rentIds = group("rental");
  if (passIds.length) {
    const { data } = await supabase.from("crm_passes").select("id, lesson_kind").in("id", passIds);
    for (const r of (data ?? []) as { id: number; lesson_kind: string }[]) out.set(`pass:${r.id}`, r.lesson_kind);
  }
  if (memIds.length) {
    const { data } = await supabase.from("crm_memberships").select("id, plan_name").in("id", memIds);
    for (const r of (data ?? []) as { id: number; plan_name: string }[]) out.set(`membership:${r.id}`, r.plan_name);
  }
  if (rentIds.length) {
    const { data } = await supabase.from("crm_rentals").select("id, item_name").in("id", rentIds);
    for (const r of (data ?? []) as { id: number; item_name: string }[]) out.set(`rental:${r.id}`, r.item_name);
  }
  return out;
}

export interface IssueRowRaw {
  id: number;
  coupon_id: number;
  member_id: number;
  send_id: number | null;
  code: string;
  status: string;
  issued_at: string;
  expires_at: string | null;
  used_at: string | null;
  used_by_name: string | null;
  used_ref_kind: string | null;
  used_ref_id: number | null;
  original_price_won: number | null;
  discount_applied_won: number | null;
  revoked_at: string | null;
  revoked_by_name: string | null;
  revoke_reason: string | null;
}

export const ISSUE_SELECT =
  "id, coupon_id, member_id, send_id, code, status, issued_at, expires_at, used_at, used_by_name, " +
  "used_ref_kind, used_ref_id, original_price_won, discount_applied_won, revoked_at, revoked_by_name, revoke_reason";
