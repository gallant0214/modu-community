import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { fetchSales, saleCategory } from "@/app/lib/crm-sales";

export const dynamic = "force-dynamic";

const VAT_RATE = 0.1; // 부가세 10%

/**
 * GET /api/crm/stats/center-revenue?ym=YYYY-MM
 *
 * 센터 매출 카테고리별 합산 (해당 기간 발급 기준).
 *   - 회원권 (crm_memberships)
 *   - 수강권 (crm_passes)
 *   - 락커/운동용품/기타 — 아직 매출 추적 없음 (0원)
 *
 * 응답 추가:
 *   - total_ex_vat: 부가세 제외 실제 매출 (vat_included=true 인 건은 /1.1)
 *   - potential_liability: 오늘 기준 미이행(선수금) 총합
 *     - 미시작(start_date > today) → full price
 *     - 시작됨 & 회원권(기간제) → 일할 계산 잔여일수/전체일수 × price
 *     - 시작됨 & 수강권(횟수제) → remaining_sessions/total_sessions × price
 *     - status='valid' 인 건만
 *   - liability_breakdown: { membership, pass, notStarted, inProgress }
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const ymRaw = url.searchParams.get("ym");
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  const isRange =
    ymd.test(fromRaw || "") && ymd.test(toRaw || "") && (toRaw as string) >= (fromRaw as string);

  const ym = /^\d{4}-\d{2}$/.test(ymRaw || "")
    ? (ymRaw as string)
    : new Date().toISOString().slice(0, 7);

  let startDate: string;
  let nextMonth: string;
  if (isRange) {
    startDate = fromRaw as string;
    const to = new Date(`${toRaw}T00:00:00Z`);
    to.setUTCDate(to.getUTCDate() + 1);
    nextMonth = to.toISOString().slice(0, 10);
  } else {
    const [y, m] = ym.split("-").map(Number);
    startDate = `${ym}-01`;
    nextMonth = new Date(y, m, 1).toISOString().slice(0, 10);
  }

  // 이번 기간 실제 거래(매출) — 실매출 원장 crm_sales 기준 (환불은 음수)
  //   회원권 그룹 = 멤버십 + 대여권 + 락커 / 수강권 그룹 = 이용권 + 예약권(PT) / 일반 = goods
  const periodSales = await fetchSales(ctx.centerId, startDate, nextMonth);
  let membershipRevenue = 0;
  let passRevenue = 0;
  let goodsRevenue = 0;
  let membershipCount = 0;
  let passCount = 0;
  for (const s of periodSales) {
    const cat = saleCategory(s.product_type);
    if (cat === "lesson") {
      passRevenue += s.amount_won;
      passCount += 1;
    } else if (cat === "goods") {
      goodsRevenue += s.amount_won;
    } else {
      membershipRevenue += s.amount_won; // membership / rental / locker
      membershipCount += 1;
    }
  }
  const lockerRevenue = 0;
  const etcRevenue = 0;
  const total = membershipRevenue + passRevenue + lockerRevenue + goodsRevenue + etcRevenue;

  // 잠재부채(발급 기준) 계산용: vat_included 건만 /1.1
  const exVatOne = (price: number, vatIncluded: boolean) =>
    vatIncluded ? Math.round(price / (1 + VAT_RATE)) : price;
  // 실매출은 crm_sales 에 부가세 플래그가 없어 부가세 포함가로 가정(÷1.1)
  const exVatAll = (v: number) => Math.round(v / (1 + VAT_RATE));
  const membershipExVat = exVatAll(membershipRevenue);
  const passExVat = exVatAll(passRevenue);
  const goodsExVat = exVatAll(goodsRevenue);
  const totalExVat = membershipExVat + passExVat + lockerRevenue + goodsExVat + etcRevenue;

  // 오늘 기준 잠재부채 스냅샷 (기간 무관, 활성 건 전체)
  const today = kstYmd();
  const [membershipsValid, passesValid, rentalsValid] = await Promise.all([
    paginateAll<{
      price_won: number;
      vat_included: boolean | null;
      start_date: string;
      expires_at: string;
    }>((f, t) =>
      supabase
        .from("crm_memberships")
        .select("price_won, vat_included, start_date, expires_at")
        .eq("center_id", ctx.centerId)
        .eq("status", "valid")
        .range(f, t)
    ),
    paginateAll<{
      price_won: number;
      vat_included: boolean | null;
      start_date: string;
      total_sessions: number;
      remaining_sessions: number;
    }>((f, t) =>
      supabase
        .from("crm_passes")
        .select("price_won, vat_included, start_date, total_sessions, remaining_sessions")
        .eq("center_id", ctx.centerId)
        .eq("status", "valid")
        .range(f, t)
    ),
    paginateAll<{
      price_won: number;
      vat_included: boolean | null;
      start_date: string;
      expires_at: string;
    }>((f, t) =>
      supabase
        .from("crm_rentals")
        .select("price_won, vat_included, start_date, expires_at")
        .eq("center_id", ctx.centerId)
        .eq("status", "valid")
        .range(f, t)
    ),
  ]);

  let liabilityMembership = 0;
  let liabilityPass = 0;
  let liabilityNotStarted = 0;
  let liabilityInProgress = 0;
  // 잠재부채 중 부가세 제외분 (vat_included 건은 /1.1)
  let liabilityExVat = 0;

  for (const m of membershipsValid) {
    const price = m.price_won ?? 0;
    if (!price) continue;
    const exVat = exVatOne(price, !!m.vat_included);
    if (m.start_date > today) {
      liabilityMembership += price;
      liabilityNotStarted += price;
      liabilityExVat += exVat;
      continue;
    }
    // 진행중: 잔여일 / 전체일 × price
    const totalDays = daysBetween(m.start_date, m.expires_at) + 1;
    const remainingDays = Math.max(0, daysBetween(today, m.expires_at));
    if (totalDays <= 0) continue;
    const frac = remainingDays / totalDays;
    const unused = Math.round(frac * price);
    liabilityMembership += unused;
    liabilityInProgress += unused;
    liabilityExVat += Math.round(frac * exVat);
  }

  // 락커·운동복(crm_rentals) — 기간제, 회원권 그룹에 합산
  for (const r of rentalsValid) {
    const price = r.price_won ?? 0;
    if (!price) continue;
    const exVat = exVatOne(price, !!r.vat_included);
    if (r.start_date > today) {
      liabilityMembership += price;
      liabilityNotStarted += price;
      liabilityExVat += exVat;
      continue;
    }
    const totalDays = daysBetween(r.start_date, r.expires_at) + 1;
    const remainingDays = Math.max(0, daysBetween(today, r.expires_at));
    if (totalDays <= 0) continue;
    const frac = remainingDays / totalDays;
    const unused = Math.round(frac * price);
    liabilityMembership += unused;
    liabilityInProgress += unused;
    liabilityExVat += Math.round(frac * exVat);
  }

  for (const p of passesValid) {
    const price = p.price_won ?? 0;
    if (!price) continue;
    const exVat = exVatOne(price, !!p.vat_included);
    if (p.start_date > today) {
      liabilityPass += price;
      liabilityNotStarted += price;
      liabilityExVat += exVat;
      continue;
    }
    const total = p.total_sessions ?? 0;
    const remaining = p.remaining_sessions ?? 0;
    if (total <= 0) continue;
    const frac = remaining / total;
    const unused = Math.round(frac * price);
    liabilityPass += unused;
    liabilityInProgress += unused;
    liabilityExVat += Math.round(frac * exVat);
  }

  const potentialLiability = liabilityMembership + liabilityPass;
  const liabilityVat = potentialLiability - liabilityExVat;

  return NextResponse.json({
    ym,
    total,
    total_ex_vat: totalExVat,
    vat_amount: total - totalExVat,
    counts: {
      memberships: membershipCount,
      passes: passCount,
    },
    categories: {
      membership: membershipRevenue,
      pass: passRevenue,
      locker: lockerRevenue,
      goods: goodsRevenue,
      etc: etcRevenue,
    },
    categories_ex_vat: {
      membership: membershipExVat,
      pass: passExVat,
      locker: lockerRevenue,
      goods: goodsExVat,
      etc: etcRevenue,
    },
    potential_liability: potentialLiability,
    potential_liability_ex_vat: liabilityExVat,
    potential_liability_vat: liabilityVat,
    liability_breakdown: {
      membership: liabilityMembership,
      pass: liabilityPass,
      notStarted: liabilityNotStarted,
      inProgress: liabilityInProgress,
    },
  });
}

function kstYmd(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`);
  const b = new Date(`${to}T00:00:00Z`);
  return Math.round((b.getTime() - a.getTime()) / (24 * 3600 * 1000));
}

async function paginateAll<T>(
  build: (from: number, to: number) => { then: (fn: (r: unknown) => void) => unknown },
  chunk = 1000
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += chunk) {
    const to = from + chunk - 1;
    const res = (await build(from, to)) as { data: T[] | null; error: unknown };
    if (res.error) throw res.error;
    const rows = res.data ?? [];
    out.push(...rows);
    if (rows.length < chunk) break;
  }
  return out;
}
