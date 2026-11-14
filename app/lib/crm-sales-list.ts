import "server-only";
import { supabase } from "./supabase";
import { saleCategory } from "./crm-sales";

/**
 * 기간 매출 라인아이템 — 통계 '매출 리스트'(/api/crm/stats/sales-list)와 외부 연동 API(/api/open/v1/sales) 공용.
 * 🚨 두 곳이 같은 합계를 내야 하므로 규칙은 여기 한 곳에서만 바꾼다.
 *
 * 센터 매출(center-revenue)과 동일한 소스 규칙:
 *   1) crm_sales 원장(BROJ 임포트) — 원장 커버 구간
 *   2) 원장 커버 컷오프(마지막 거래일) 이후의 CRM 결제(crm_payments, paid_at 기준, 취소 제외)
 *   → 이중집계 없이 실제 매출과 리스트 합계가 일치.
 */
export type SalesListItem = {
  date: string; // ISO (tx_at / paid time)
  member_id: number | null;
  member_name: string | null;
  product_name: string;
  category: string; // 회원권 / 수강권 / 대여권 / 락커 / 기타
  amount_won: number;
  payment_method: string | null; // 현금 / 카드 / 문화상품권 / 계좌이체·기타
  registration_type: string | null; // 신규 / 재등록
  source: "ledger" | "issuance";
};

/** KST 날짜 [startYmd, endExclYmd) 의 매출 라인아이템(최신순) */
export async function loadSalesListItems(
  centerId: number,
  startYmd: string,
  endExclYmd: string
): Promise<SalesListItem[]> {
  type Item = SalesListItem;
  const items: Item[] = [];

  const CAT_KO: Record<string, string> = {
    membership: "회원권",
    lesson: "수강권",
    rental: "운동복",
    locker: "락커",
    goods: "기타",
  };
  // 원장 결제수단 표기 — 결제채널이 단일 수단이면 그대로 쓴다.
  // (BROJ 원장은 계좌이체 건도 cash_won/card_won 에 금액이 쪼개져 들어와 금액만으로는 구분 불가)
  const salePayMethod = (
    channel: string | null,
    cash: number,
    card: number,
    amount: number
  ): string => {
    const ch = (channel ?? "").trim();
    if (ch === "계좌이체" || ch === "카드" || ch === "현금") return ch;
    const parts: string[] = [];
    if (card > 0) parts.push("카드");
    if (cash > 0) parts.push("현금");
    const other = amount - cash - card;
    if (other > 0) parts.push("기타");
    return parts.length ? parts.join("+") : ch || "기타";
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
  const { hasSales, cutoffYmd } = await centerSalesInfo(centerId);
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
      payment_channel: string | null;
      registration_type: string | null;
    };
    const rows = await paginateAll<Row>((f, t) =>
      supabase
        .from("crm_sales")
        .select(
          "tx_at, amount_won, product_type, product_name, member_id, customer_name, cash_won, card_won, culture_won, payment_channel, registration_type"
        )
        .eq("center_id", centerId)
        .gte("tx_at", `${startYmd}T00:00:00+09:00`)
        .lt("tx_at", `${endExclYmd}T00:00:00+09:00`)
        .order("tx_at", { ascending: false })
        .range(f, t)
    );
    // 원장에 없는 member_id → 이름 보강
    const missingIds = Array.from(
      new Set(rows.filter((r) => r.member_id && !r.customer_name).map((r) => r.member_id as number))
    );
    const nameMap = await fetchMemberNames(centerId, missingIds);
    for (const r of rows) {
      const cat = saleCategory(r.product_type);
      items.push({
        date: r.tx_at,
        member_id: r.member_id,
        member_name: r.customer_name ?? (r.member_id ? nameMap.get(r.member_id) ?? null : null),
        product_name: r.product_name ?? CAT_KO[cat] ?? "상품",
        category: CAT_KO[cat] ?? "기타",
        amount_won: r.amount_won ?? 0,
        payment_method: salePayMethod(r.payment_channel, r.cash_won ?? 0, r.card_won ?? 0, r.amount_won ?? 0),
        registration_type: (r.registration_type ?? "").trim() || null,
        source: "ledger",
      });
    }
  }

  // ── 2) 컷오프 이후 CRM 신규 결제 (paid_at 기준, BROJ 화면과 통일) ──
  // 기존 로직: 발급 상품(start_date/issued_at) 기반 → 미래 등록도 매출로 잡혀 BROJ 와 불일치
  // 변경: crm_payments 를 paid_at 기준으로 조회 (실제 결제 시점만)
  const issuanceStart =
    hasSales && cutoffYmd ? (nextYmd(cutoffYmd) > startYmd ? nextYmd(cutoffYmd) : startYmd) : startYmd;
  if (issuanceStart < endExclYmd) {
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
        .eq("center_id", centerId)
        .gte("paid_at", `${issuanceStart}T00:00:00+09:00`)
        .lt("paid_at", `${endExclYmd}T00:00:00+09:00`)
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
      fetchMemberNames(centerId, memberIds),
    ]);
    const passName = new Map((passRes.data ?? []).map((p) => [p.id, p.lesson_kind ?? "수강권"]));
    const msName = new Map((msRes.data ?? []).map((m) => [m.id, m.plan_name ?? "회원권"]));
    const rnName = new Map((rnRes.data ?? []).map((r) => [r.id, r.item_name ?? "운동복"]));

    for (const p of pays) {
      let productName = "결제";
      let category = "기타";
      if (p.pass_id) { productName = passName.get(p.pass_id) ?? "수강권"; category = "수강권"; }
      else if (p.membership_id) { productName = msName.get(p.membership_id) ?? "회원권"; category = "회원권"; }
      else if (p.rental_id) { productName = rnName.get(p.rental_id) ?? "운동복"; category = "운동복"; }
      items.push({
        date: p.paid_at ?? `${issuanceStart}T00:00:00+09:00`,
        member_id: p.member_id,
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
  return items;
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
