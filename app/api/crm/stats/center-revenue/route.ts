import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import { fetchSales, saleCategory, buildRegistrationClassifier } from "@/app/lib/crm-sales";
import { cached, crmCacheKey } from "@/app/lib/cache";

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
  // 센터 전체 재무 통계 열람 권한
  if (!(await ctxHasPermission(ctx, "stats.view"))) {
    return NextResponse.json({ error: "통계 열람 권한이 없습니다" }, { status: 403 });
  }

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

  // 이번 기간 실제 거래(매출).
  // 원장 우선순위:
  //   1) crm_sales (BROJ 임포트 완료 센터) — 원장이 존재하면 이 값을 신뢰
  //   2) 폴백: crm_memberships / crm_passes / crm_rentals 발급 기준
  //      (CRM UI 로만 발급한 신규 센터는 crm_sales 가 비어 있으므로)
  //   회원권 그룹 = 멤버십 + 대여권 + 락커 / 수강권 그룹 = 이용권 + 예약권(PT) / 일반 = goods
  // crm_sales 원장 존재 여부 + 임포트 커버 컷오프(원장 마지막 거래일, KST).
  // 컷오프 이후 발생한 CRM 신규 발급은 원장에 없으므로 발급 테이블에서 합산해야 함.
  // 센터 전체 재무 집계는 무겁고(전체 유효건 스캔) 초 단위로 안 바뀜 → 60초 캐시.
  const cacheKey = crmCacheKey(
    ctx,
    "stats:center-revenue",
    isRange ? `r:${startDate}:${nextMonth}` : ym,
  );
  const payload = await cached(cacheKey, 60, async () => {
  const { hasSales: centerHasSales, cutoffYmd } = await centerSalesInfo(ctx.centerId);
  const [periodSales, regClassifier] = await Promise.all([
    centerHasSales ? fetchSales(ctx.centerId, startDate, nextMonth) : Promise.resolve([]),
    // 신규/재등록은 저장된 플래그가 아니라 회원별 '최초 구매일' 로 판정한다.
    buildRegistrationClassifier(ctx.centerId),
  ]);
  let membershipRevenue = 0;
  let passRevenue = 0;
  let goodsRevenue = 0;
  let membershipCount = 0;
  let passCount = 0;

  // 결제수단 집계 (전체 · 회원권그룹 · 수강권그룹)
  const emptyPay = () => ({ cash: 0, card: 0, transfer: 0, other: 0 });
  const payTotal = emptyPay();
  const payMembership = emptyPay();
  const payPass = emptyPay();

  // 등록 타입(신규/재등록) 집계
  const emptyReg = () => ({ new: 0, renewal: 0, unknown: 0 });
  const regTotal = emptyReg();
  const regMembership = emptyReg();
  const regPass = emptyReg();

  // 원장(crm_sales) 결제수단 집계 — 결제채널(payment_channel) 우선.
  // BROJ 원장은 계좌이체 건도 cash_won/card_won 에 금액이 쪼개져 들어와 있어
  // 금액 칼럼만으로는 계좌이체를 구분할 수 없다. 채널이 단일 수단이면 총액을 그 수단에 싣고,
  // 혼합('현금+카드')·미상 채널만 금액 칼럼으로 분해한다.
  const addPay = (bucket: ReturnType<typeof emptyPay>, s: (typeof periodSales)[number]) => {
    const amount = s.amount_won ?? 0;
    const channel = (s.payment_channel ?? "").trim();
    if (channel === "계좌이체") {
      bucket.transfer += amount;
      return;
    }
    if (channel === "카드") {
      bucket.card += amount;
      return;
    }
    if (channel === "현금") {
      bucket.cash += amount;
      return;
    }
    // 혼합·기타 채널: 금액 칼럼으로 분해하고 나머지는 기타
    const cash = s.cash_won ?? 0;
    const card = s.card_won ?? 0;
    bucket.cash += cash;
    bucket.card += card;
    const other = amount - cash - card;
    if (other) bucket.other += other;
  };
  const addReg = (bucket: ReturnType<typeof emptyReg>, s: (typeof periodSales)[number]) => {
    const amt = s.amount_won ?? 0;
    const rowYmd = new Date(new Date(s.tx_at).getTime() + 9 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    bucket[regClassifier.classify(s.member_id, s.customer_phone, rowYmd)] += amt;
  };

  for (const s of periodSales) {
    const cat = saleCategory(s.product_type);
    if (cat === "lesson") {
      passRevenue += s.amount_won;
      passCount += 1;
      addPay(payPass, s);
      addReg(regPass, s);
    } else if (cat === "goods") {
      goodsRevenue += s.amount_won;
    } else {
      membershipRevenue += s.amount_won; // membership / rental / locker
      membershipCount += 1;
      addPay(payMembership, s);
      addReg(regMembership, s);
    }
    addPay(payTotal, s);
    addReg(regTotal, s);
  }

  // ── crm_sales 원장이 커버하지 못하는 구간(컷오프 이후)의 CRM 발급을 합산 ──
  // 원장 없는 센터 → 전체 기간 발급 집계. 원장 있는 센터 → 컷오프 다음날부터만(이중집계 방지).
  const issuanceStart =
    centerHasSales && cutoffYmd
      ? (nextYmd(cutoffYmd) > startDate ? nextYmd(cutoffYmd) : startDate)
      : startDate;
  if (issuanceStart < nextMonth) {
    // 기간: [issuanceStart, nextMonth) 을 issued_at/start_date 기준으로 조회
    const [issMemberships, issPasses, issRentals] = await Promise.all([
      paginateAll<{
        price_won: number;
        payment_method: string | null;
        start_date?: string | null;
        purchased_at?: string | null;
        member_id: number | null;
      }>((f, t) =>
        // crm_memberships 에는 registration_type 이 없다 → 회원의 최초 구매일로 판정.
        supabase
          .from("crm_memberships")
          .select("price_won, payment_method, start_date, purchased_at, member_id")
          .eq("center_id", ctx.centerId)
          .gte("start_date", issuanceStart)
          .lt("start_date", nextMonth)
          .range(f, t)
      ),
      paginateAll<{
        price_won: number;
        payment_method: string | null;
        issue_type: string | null;
        issued_at: string | null;
        member_id: number | null;
      }>((f, t) =>
        supabase
          .from("crm_passes")
          .select("price_won, payment_method, issue_type, issued_at, member_id")
          .eq("center_id", ctx.centerId)
          .gte("issued_at", issuanceStart)
          .lt("issued_at", nextMonth)
          .range(f, t)
      ),
      paginateAll<{
        price_won: number;
        payment_method: string | null;
        start_date?: string | null;
        member_id: number | null;
      }>((f, t) =>
        supabase
          .from("crm_rentals")
          .select("price_won, payment_method, start_date, member_id")
          .eq("center_id", ctx.centerId)
          .gte("start_date", issuanceStart)
          .lt("start_date", nextMonth)
          .range(f, t)
      ),
    ]);

    const applyIssuance = (
      priceWon: number,
      paymentMethod: string | null,
      regKey: "new" | "renewal" | "unknown",
      cat: "membership" | "pass"
    ) => {
      if (cat === "pass") {
        passRevenue += priceWon;
        passCount += 1;
      } else {
        membershipRevenue += priceWon;
        membershipCount += 1;
      }
      // 결제수단 매핑
      const key: "cash" | "card" | "transfer" | "other" =
        paymentMethod === "cash"
          ? "cash"
          : paymentMethod === "card"
            ? "card"
            : paymentMethod === "transfer"
              ? "transfer" // 발급 모달의 '계좌' 선택
              : "other"; // etc / custom / null
      const payBucket = cat === "pass" ? payPass : payMembership;
      payBucket[key] += priceWon;
      payTotal[key] += priceWon;
      // 등록 타입 매핑
      const regBucket = cat === "pass" ? regPass : regMembership;
      regBucket[regKey] += priceWon;
      regTotal[regKey] += priceWon;
    };

    // 발급분도 동일 기준(회원의 최초 구매일)으로 신규/재등록 판정
    for (const m of issMemberships) {
      const key = regClassifier.classify(m.member_id, null, m.purchased_at ?? m.start_date);
      applyIssuance(m.price_won ?? 0, m.payment_method, key, "membership");
    }
    for (const p of issPasses) {
      const key = regClassifier.classify(p.member_id, null, p.issued_at);
      applyIssuance(p.price_won ?? 0, p.payment_method, key, "pass");
    }
    for (const r of issRentals) {
      const key = regClassifier.classify(r.member_id, null, r.start_date);
      applyIssuance(r.price_won ?? 0, r.payment_method, key, "membership");
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
      member_id: number;
      price_won: number;
      vat_included: boolean | null;
      start_date: string;
      expires_at: string;
    }>((f, t) =>
      supabase
        .from("crm_memberships")
        .select("member_id, price_won, vat_included, start_date, expires_at")
        .eq("center_id", ctx.centerId)
        .eq("status", "valid")
        .range(f, t)
    ),
    paginateAll<{
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
        .eq("center_id", ctx.centerId)
        .eq("status", "valid")
        .range(f, t)
    ),
    paginateAll<{
      member_id: number;
      price_won: number;
      vat_included: boolean | null;
      start_date: string;
      expires_at: string;
    }>((f, t) =>
      supabase
        .from("crm_rentals")
        .select("member_id, price_won, vat_included, start_date, expires_at")
        .eq("center_id", ctx.centerId)
        .eq("status", "valid")
        .range(f, t)
    ),
  ]);

  let liabilityMembership = 0;
  let liabilityPass = 0;
  // 카드 표시용 — 부채가 남아 있는 회원 수 / 수강권 잔여 회차 합
  const liabilityMembershipMembers = new Set<number>();
  const liabilityPassMembers = new Set<number>();
  let liabilityPassSessions = 0;
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
      liabilityMembershipMembers.add(m.member_id);
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
    if (unused > 0) liabilityMembershipMembers.add(m.member_id);
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
      liabilityMembershipMembers.add(r.member_id);
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
    if (unused > 0) liabilityMembershipMembers.add(r.member_id);
  }

  for (const p of passesValid) {
    const price = p.price_won ?? 0;
    if (!price) continue;
    const exVat = exVatOne(price, !!p.vat_included);
    if (p.start_date > today) {
      liabilityPass += price;
      liabilityNotStarted += price;
      liabilityExVat += exVat;
      liabilityPassMembers.add(p.member_id);
      liabilityPassSessions += Math.max(0, p.remaining_sessions ?? p.total_sessions ?? 0);
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
    if (remaining > 0) {
      liabilityPassMembers.add(p.member_id);
      liabilityPassSessions += remaining;
    }
  }

  const potentialLiability = liabilityMembership + liabilityPass;
  const liabilityVat = potentialLiability - liabilityExVat;

  // ── 선택 기간 잠재부채 변동 (유입 / 소진) ─────────────────────────────
  // 총액은 '잔액(스톡)' 이라 수업을 해도 신규 결제가 그만큼 쌓이면 제자리로 보인다.
  // 왜 안 줄었는지 알 수 있도록 기간 중 증감을 함께 계산해 내려준다.
  //   유입 = 기간 내 발급된 상품의 결제금액 (새로 쌓인 선수금)
  //   소진 = 수업 소진(출석·노쇼 회차 × 회당 단가) + 기간 경과분(기간제 일할)
  // 환불·삭제분은 제외한 참고치.
  const periodEndExclusive = nextMonth; // [startDate, nextMonth)
  // 기간 경과분 계산은 '오늘까지'만 (미래 구간은 아직 소진되지 않음)
  const decayEnd = periodEndExclusive <= today ? periodEndExclusive : today;

  const [issuedMs, issuedRs, issuedPs, consumedRes] = await Promise.all([
    paginateAll<{ price_won: number }>((f, t) =>
      supabase
        .from("crm_memberships")
        .select("price_won")
        .eq("center_id", ctx.centerId)
        .eq("status", "valid")
        .gte("created_at", `${startDate}T00:00:00+09:00`)
        .lt("created_at", `${periodEndExclusive}T00:00:00+09:00`)
        .range(f, t)
    ),
    paginateAll<{ price_won: number }>((f, t) =>
      supabase
        .from("crm_rentals")
        .select("price_won")
        .eq("center_id", ctx.centerId)
        .eq("status", "valid")
        .gte("created_at", `${startDate}T00:00:00+09:00`)
        .lt("created_at", `${periodEndExclusive}T00:00:00+09:00`)
        .range(f, t)
    ),
    paginateAll<{ price_won: number }>((f, t) =>
      supabase
        .from("crm_passes")
        .select("price_won")
        .eq("center_id", ctx.centerId)
        .eq("status", "valid")
        .gte("created_at", `${startDate}T00:00:00+09:00`)
        .lt("created_at", `${periodEndExclusive}T00:00:00+09:00`)
        .range(f, t)
    ),
    paginateAll<{ pass_id: number | null }>((f, t) =>
      supabase
        .from("crm_reservations")
        .select("pass_id")
        .eq("center_id", ctx.centerId)
        .in("status", ["attended", "noshow"])
        .gte("starts_at", `${startDate}T00:00:00+09:00`)
        .lt("starts_at", `${periodEndExclusive}T00:00:00+09:00`)
        .range(f, t)
    ),
  ]);

  const inflow =
    [...issuedMs, ...issuedRs, ...issuedPs].reduce((sum, r) => sum + (r.price_won ?? 0), 0);

  // 수업 소진: 회차당 단가 = price / total_sessions (세션제만)
  const passUnitPrice = new Map<number, number>();
  for (const p of passesValid) {
    const total = p.total_sessions ?? 0;
    if (total > 0 && p.price_won) passUnitPrice.set(p.id, p.price_won / total);
  }
  let outflowSessions = 0;
  let consumedSessionCount = 0;
  for (const r of consumedRes) {
    const unit = r.pass_id ? passUnitPrice.get(r.pass_id) : undefined;
    if (unit === undefined) continue;
    outflowSessions += unit;
    consumedSessionCount += 1;
  }
  outflowSessions = Math.round(outflowSessions);

  // 기간 경과분(기간제): 기간과 겹치는 일수 × 일단가
  const decayOf = (price: number, startYmd: string, expiresYmd: string): number => {
    if (!price) return 0;
    const totalDays = daysBetween(startYmd, expiresYmd) + 1;
    if (totalDays <= 0) return 0;
    const from = startYmd > startDate ? startYmd : startDate;
    const toEx = expiresYmd < decayEnd ? expiresYmd : decayEnd; // expires 당일까지 소진
    const days = daysBetween(from, toEx) + (expiresYmd < decayEnd ? 1 : 0);
    if (days <= 0) return 0;
    return (price / totalDays) * Math.min(days, totalDays);
  };
  let outflowElapsed = 0;
  for (const m of membershipsValid) outflowElapsed += decayOf(m.price_won ?? 0, m.start_date, m.expires_at);
  for (const r of rentalsValid) outflowElapsed += decayOf(r.price_won ?? 0, r.start_date, r.expires_at);
  outflowElapsed = Math.round(outflowElapsed);

  const outflow = outflowSessions + outflowElapsed;

  return {
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
      // 카드 표시용 — 인원 수 / 수강권 잔여 회차
      membership_members: liabilityMembershipMembers.size,
      membership_avg_per_member: liabilityMembershipMembers.size
        ? Math.round(liabilityMembership / liabilityMembershipMembers.size)
        : 0,
      pass_members: liabilityPassMembers.size,
      pass_sessions: liabilityPassSessions,
    },
    // 선택 기간 잠재부채 변동 (환불·삭제 제외 참고치)
    liability_change: {
      inflow,
      outflow,
      outflow_sessions: outflowSessions,
      outflow_elapsed: outflowElapsed,
      net: inflow - outflow,
      consumed_sessions: consumedSessionCount,
    },
    // 결제수단별 매출 (현금·카드·문화상품권·기타) — 전체 / 회원권 / 수강권
    payment_totals: {
      total: payTotal,
      membership: payMembership,
      pass: payPass,
    },
    // 신규 vs 재등록 매출 — 전체 / 회원권 / 수강권
    registration_totals: {
      total: regTotal,
      membership: regMembership,
      pass: regPass,
    },
  };
  });

  return NextResponse.json(payload);
}

function kstYmd(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10);
}

/** crm_sales 원장(BROJ 임포트) 존재 여부 + 커버 컷오프(마지막 거래일, KST YYYY-MM-DD).
 *  컷오프 이후 CRM 신규 발급은 원장에 없어 발급 테이블에서 합산해야 한다. */
async function centerSalesInfo(
  centerId: number
): Promise<{ hasSales: boolean; cutoffYmd: string | null }> {
  const { data } = await supabase
    .from("crm_sales")
    .select("tx_at")
    .eq("center_id", centerId)
    .order("tx_at", { ascending: false })
    .limit(1);
  const maxTx = (data?.[0] as { tx_at?: string } | undefined)?.tx_at;
  if (!maxTx) return { hasSales: false, cutoffYmd: null };
  const cutoffYmd = new Date(new Date(maxTx).getTime() + 9 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  return { hasSales: true, cutoffYmd };
}

/** KST 날짜 다음날 (YYYY-MM-DD) */
function nextYmd(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
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
