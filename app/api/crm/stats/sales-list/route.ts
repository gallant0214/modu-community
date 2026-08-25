import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import { saleCategory } from "@/app/lib/crm-sales";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/stats/sales-list?ym=YYYY-MM  (또는 from=YYYY-MM-DD&to=YYYY-MM-DD)
 *
 * 해당 기간에 "결제된 상품" 라인아이템 리스트.
 * 센터 매출(center-revenue)과 동일한 소스 규칙:
 *   1) crm_sales 원장(BROJ 임포트) — 원장 커버 구간
 *   2) 원장 커버 컷오프(마지막 거래일) 이후의 CRM 신규 발급
 *      (crm_memberships / crm_passes / crm_rentals)
 *   → 이중집계 없이 실제 매출과 리스트 합계가 일치.
 *
 * 각 항목: { date, member_name, product_name, category, amount_won, payment_method, registration_type, source }
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
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

  type Item = {
    date: string; // ISO (tx_at / paid time)
    member_name: string | null;
    product_name: string;
    category: string; // 회원권 / 수강권 / 대여권 / 락커 / 기타
    amount_won: number;
    payment_method: string | null; // 현금 / 카드 / 문화상품권 / 계좌이체·기타
    registration_type: string | null; // 신규 / 재등록
    source: "ledger" | "issuance";
  };
  const items: Item[] = [];

  const CAT_KO: Record<string, string> = {
    membership: "회원권",
    lesson: "수강권",
    rental: "대여권",
    locker: "락커",
    goods: "기타",
  };
  const salePayMethod = (cash: number, card: number, culture: number, amount: number): string => {
    const parts: string[] = [];
    if (card > 0) parts.push("카드");
    if (cash > 0) parts.push("현금");
    if (culture > 0) parts.push("문화상품권");
    const other = amount - cash - card - culture;
    if (other > 0) parts.push("계좌이체·기타");
    return parts.length ? parts.join("+") : "기타";
  };
  const methodKo = (pm: string | null): string =>
    pm === "cash"
      ? "현금"
      : pm === "card"
        ? "카드"
        : pm === "transfer"
          ? "계좌이체"
          : pm
            ? "기타"
            : "기타";

  // ── 1) crm_sales 원장 (커버 구간) ──
  const { hasSales, cutoffYmd } = await centerSalesInfo(ctx.centerId);
  if (hasSales) {
    type Row = {
      tx_at: string;
      amount_won: number;
      product_type: string | null;
      product_name: string | null;
      member_id: number | null;
      customer_name: string | null;
      cash_won: number;
      card_won: number;
      culture_won: number;
      registration_type: string | null;
    };
    const rows = await paginateAll<Row>((f, t) =>
      supabase
        .from("crm_sales")
        .select(
          "tx_at, amount_won, product_type, product_name, member_id, customer_name, cash_won, card_won, culture_won, registration_type"
        )
        .eq("center_id", ctx.centerId)
        .gte("tx_at", `${startDate}T00:00:00+09:00`)
        .lt("tx_at", `${nextMonth}T00:00:00+09:00`)
        .order("tx_at", { ascending: false })
        .range(f, t)
    );
    // 원장에 없는 member_id → 이름 보강
    const missingIds = Array.from(
      new Set(rows.filter((r) => r.member_id && !r.customer_name).map((r) => r.member_id as number))
    );
    const nameMap = await fetchMemberNames(ctx.centerId, missingIds);
    for (const r of rows) {
      const cat = saleCategory(r.product_type);
      items.push({
        date: r.tx_at,
        member_name: r.customer_name ?? (r.member_id ? nameMap.get(r.member_id) ?? null : null),
        product_name: r.product_name ?? CAT_KO[cat] ?? "상품",
        category: CAT_KO[cat] ?? "기타",
        amount_won: r.amount_won ?? 0,
        payment_method: salePayMethod(r.cash_won ?? 0, r.card_won ?? 0, r.culture_won ?? 0, r.amount_won ?? 0),
        registration_type: (r.registration_type ?? "").trim() || null,
        source: "ledger",
      });
    }
  }

  // ── 2) 컷오프 이후 CRM 신규 결제 (paid_at 기준, BROJ 화면과 통일) ──
  // 기존 로직: 발급 상품(start_date/issued_at) 기반 → 미래 등록도 매출로 잡혀 BROJ 와 불일치
  // 변경: crm_payments 를 paid_at 기준으로 조회 (실제 결제 시점만)
  const issuanceStart =
    hasSales && cutoffYmd ? (nextYmd(cutoffYmd) > startDate ? nextYmd(cutoffYmd) : startDate) : startDate;
  if (issuanceStart < nextMonth) {
    const pays = await paginateAll<{
      id: number;
      member_id: number | null;
      amount_won: number | null;
      paid_at: string | null;
      method: string | null;
      pass_id: number | null;
      membership_id: number | null;
      rental_id: number | null;
      status: string | null;
    }>((f, t) =>
      supabase
        .from("crm_payments")
        .select("id, member_id, amount_won, paid_at, method, pass_id, membership_id, rental_id, status")
        .eq("center_id", ctx.centerId)
        .gte("paid_at", `${issuanceStart}T00:00:00+09:00`)
        .lt("paid_at", `${nextMonth}T00:00:00+09:00`)
        .neq("status", "cancelled")
        .range(f, t)
    );

    // 상품 이름 lookup 준비
    const passIds = Array.from(new Set(pays.map((p) => p.pass_id).filter(Boolean))) as number[];
    const msIds = Array.from(new Set(pays.map((p) => p.membership_id).filter(Boolean))) as number[];
    const rnIds = Array.from(new Set(pays.map((p) => p.rental_id).filter(Boolean))) as number[];
    const memberIds = Array.from(new Set(pays.map((p) => p.member_id).filter(Boolean))) as number[];

    const [passRes, msRes, rnRes, nameMap] = await Promise.all([
      passIds.length
        ? supabase.from("crm_passes").select("id, lesson_kind").in("id", passIds)
        : Promise.resolve({ data: [] as { id: number; lesson_kind: string | null }[] }),
      msIds.length
        ? supabase.from("crm_memberships").select("id, plan_name").in("id", msIds)
        : Promise.resolve({ data: [] as { id: number; plan_name: string | null }[] }),
      rnIds.length
        ? supabase.from("crm_rentals").select("id, item_name").in("id", rnIds)
        : Promise.resolve({ data: [] as { id: number; item_name: string | null }[] }),
      fetchMemberNames(ctx.centerId, memberIds),
    ]);
    const passName = new Map((passRes.data ?? []).map((p) => [p.id, p.lesson_kind ?? "수강권"]));
    const msName = new Map((msRes.data ?? []).map((m) => [m.id, m.plan_name ?? "회원권"]));
    const rnName = new Map((rnRes.data ?? []).map((r) => [r.id, r.item_name ?? "대여권"]));

    for (const p of pays) {
      let productName = "결제";
      let category = "기타";
      if (p.pass_id) { productName = passName.get(p.pass_id) ?? "수강권"; category = "수강권"; }
      else if (p.membership_id) { productName = msName.get(p.membership_id) ?? "회원권"; category = "회원권"; }
      else if (p.rental_id) { productName = rnName.get(p.rental_id) ?? "대여권"; category = "대여권"; }
      items.push({
        date: p.paid_at ?? `${issuanceStart}T00:00:00+09:00`,
        member_name: p.member_id ? nameMap.get(p.member_id) ?? null : null,
        product_name: productName,
        category,
        amount_won: p.amount_won ?? 0,
        payment_method: methodKo(p.method),
        registration_type: null,
        source: "issuance",
      });
    }
  }

  // 최신순 정렬
  items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const total = items.reduce((s, it) => s + (it.amount_won ?? 0), 0);

  return NextResponse.json({ ym, count: items.length, total, items });
}

async function fetchMemberNames(
  centerId: number,
  ids: number[]
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (!ids.length) return map;
  const chunk = 500;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const { data } = await supabase
      .from("crm_members")
      .select("id, name")
      .eq("center_id", centerId)
      .in("id", slice);
    for (const m of (data ?? []) as { id: number; name: string }[]) map.set(m.id, m.name);
  }
  return map;
}

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

function nextYmd(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
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
