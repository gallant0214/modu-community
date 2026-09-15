import { supabase } from "@/app/lib/supabase";

/**
 * 잠재부채(선수금) 스냅샷 — 오늘 KST 기준, 유효(valid) 상품의 아직 제공하지 않은 금액.
 *   - 미시작(start_date > today)      → 결제금액 전액
 *   - 기간제(회원권·락커·운동복) 진행중 → 잔여일수/전체일수 × 결제금액
 *   - 횟수제(수강권) 진행중           → 잔여회차/총회차 × 결제금액
 *
 * 통계 센터매출(center-revenue)의 잠재부채와 같은 공식. 경영 요약 탭에서 사용.
 */

const VAT_RATE = 0.1;

export interface LiabilitySnapshot {
  total: number;
  membership: number;
  pass: number;
  not_started: number;
  in_progress: number;
  ex_vat: number;
  vat: number;
  membership_members: number;
  pass_members: number;
  pass_sessions: number;
}

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 두 YYYY-MM-DD 사이 일수 (to − from) */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

async function pageAll<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data } = await run(from, from + size - 1);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < size) break;
  }
  return out;
}

export async function computeLiabilitySnapshot(centerId: number): Promise<LiabilitySnapshot> {
  const today = kstToday();
  const exVatOne = (price: number, vatIncluded: boolean) =>
    vatIncluded ? Math.round(price / (1 + VAT_RATE)) : price;

  const [membershipsValid, passesValid, rentalsValid] = await Promise.all([
    pageAll<{
      member_id: number;
      price_won: number;
      vat_included: boolean | null;
      start_date: string;
      expires_at: string;
    }>((f, t) =>
      supabase
        .from("crm_memberships")
        .select("member_id, price_won, vat_included, start_date, expires_at")
        .eq("center_id", centerId)
        .eq("status", "valid")
        .range(f, t)
    ),
    pageAll<{
      id: number;
      member_id: number;
      price_won: number;
      vat_included: boolean | null;
      start_date: string;
      total_sessions: number;
      remaining_sessions: number;
    }>((f, t) =>
      supabase
        .from("crm_passes")
        .select("id, member_id, price_won, vat_included, start_date, total_sessions, remaining_sessions")
        .eq("center_id", centerId)
        .eq("status", "valid")
        .range(f, t)
    ),
    pageAll<{
      member_id: number;
      price_won: number;
      vat_included: boolean | null;
      start_date: string;
      expires_at: string;
    }>((f, t) =>
      supabase
        .from("crm_rentals")
        .select("member_id, price_won, vat_included, start_date, expires_at")
        .eq("center_id", centerId)
        .eq("status", "valid")
        .range(f, t)
    ),
  ]);

  let membership = 0;
  let pass = 0;
  let notStarted = 0;
  let inProgress = 0;
  let exVat = 0;
  let passSessions = 0;
  const membershipMembers = new Set<number>();
  const passMembers = new Set<number>();

  const periodItem = (it: { member_id: number; price_won: number; vat_included: boolean | null; start_date: string; expires_at: string }) => {
    const price = it.price_won ?? 0;
    if (!price) return;
    const ev = exVatOne(price, !!it.vat_included);
    if (it.start_date > today) {
      membership += price;
      notStarted += price;
      exVat += ev;
      membershipMembers.add(it.member_id);
      return;
    }
    const totalDays = daysBetween(it.start_date, it.expires_at) + 1;
    const remainingDays = Math.max(0, daysBetween(today, it.expires_at));
    if (totalDays <= 0) return;
    const frac = remainingDays / totalDays;
    const unused = Math.round(frac * price);
    membership += unused;
    inProgress += unused;
    exVat += Math.round(frac * ev);
    if (unused > 0) membershipMembers.add(it.member_id);
  };
  for (const m of membershipsValid) periodItem(m);
  for (const r of rentalsValid) periodItem(r);

  for (const p of passesValid) {
    const price = p.price_won ?? 0;
    if (!price) continue;
    const ev = exVatOne(price, !!p.vat_included);
    if (p.start_date > today) {
      pass += price;
      notStarted += price;
      exVat += ev;
      passMembers.add(p.member_id);
      passSessions += Math.max(0, p.remaining_sessions ?? p.total_sessions ?? 0);
      continue;
    }
    const total = p.total_sessions ?? 0;
    const remaining = p.remaining_sessions ?? 0;
    if (total <= 0) continue;
    const frac = remaining / total;
    const unused = Math.round(frac * price);
    pass += unused;
    inProgress += unused;
    exVat += Math.round(frac * ev);
    if (remaining > 0) {
      passMembers.add(p.member_id);
      passSessions += remaining;
    }
  }

  const total = membership + pass;
  return {
    total,
    membership,
    pass,
    not_started: notStarted,
    in_progress: inProgress,
    ex_vat: exVat,
    vat: total - exVat,
    membership_members: membershipMembers.size,
    pass_members: passMembers.size,
    pass_sessions: passSessions,
  };
}
