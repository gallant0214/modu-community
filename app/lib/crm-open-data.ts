import "server-only";
import { NextResponse } from "next/server";
import { supabase } from "./supabase";
import { enrichMemberListDetail } from "./crm-member-list-detail";
import { loadSalesListItems } from "./crm-sales-list";
import { toCsv, type CsvColumn } from "./crm-api-keys";
import { formatPhone, GENDER_LABEL } from "@/app/crm/_components/crm-labels";

/**
 * 외부 연동 API(/api/open/v1/*) 데이터 — CRM 화면과 같은 계산 함수를 그대로 쓴다.
 *  · 회원 = 회원 목록 상세(enrichMemberListDetail)
 *  · 매출 = 통계 매출 리스트(loadSalesListItems)
 * JSON 키는 영문(자동화 도구용), CSV 머리글은 한글(엑셀·시트용).
 */

const UNLIMITED = "9999-12-31";
const EXPIRING_DAYS = 7;

export function kstTodayYmd(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function addDaysYmd(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysBetween(fromYmd: string, toYmd: string): number {
  return Math.round((Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) / 86_400_000);
}
function kstYmdHm(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ");
}
const expiryText = (ymd: string | null) => (ymd === UNLIMITED ? "무기한" : ymd);

/** PostgREST 1000행 상한 → range 로 끝까지 */
async function pageAll<T>(
  run: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await run(from, from + 999);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

async function memberNames(centerId: number): Promise<Map<number, string>> {
  const rows = await pageAll<{ id: number; name: string }>((f, t) =>
    supabase.from("crm_members").select("id, name").eq("center_id", centerId).order("id").range(f, t)
  );
  return new Map(rows.map((r) => [r.id, r.name]));
}

async function staffNames(centerId: number): Promise<Map<number, string>> {
  const { data } = await supabase.from("crm_center_members").select("id, display_name").eq("center_id", centerId);
  return new Map((data ?? []).map((r) => [r.id, r.display_name ?? ""]));
}

/* ── 회원 ─────────────────────────────────────────────── */

export type OpenMemberRow = {
  member_id: number;
  name: string;
  phone: string;
  gender: string | null;
  birth: string | null;
  status: string;
  active_products: string;
  expires_at: string | null;
  days_left: number | null;
  remaining_sessions: number | null;
  on_hold: boolean;
  outstanding_won: number;
  locker: string | null;
  last_attended_at: string | null;
  last_purchase_at: string | null;
  total_paid_won: number;
  mileage: number;
  registered_at: string | null;
  first_use_at: string | null;
  marketing_consent: boolean;
};

export const OPEN_MEMBER_COLUMNS: CsvColumn<OpenMemberRow>[] = [
  { key: "member_id", label: "회원번호" },
  { key: "name", label: "이름" },
  { key: "phone", label: "연락처" },
  { key: "gender", label: "성별" },
  { key: "birth", label: "생년월일" },
  { key: "status", label: "상태" },
  { key: "active_products", label: "이용 중 상품" },
  { key: "expires_at", label: "만료일" },
  { key: "days_left", label: "남은 일수" },
  { key: "remaining_sessions", label: "수강권 남은 횟수" },
  { key: "on_hold", label: "홀딩 중" },
  { key: "outstanding_won", label: "미수금" },
  { key: "locker", label: "락커" },
  { key: "last_attended_at", label: "최근 출석일" },
  { key: "last_purchase_at", label: "최근 구매일" },
  { key: "total_paid_won", label: "누적 결제" },
  { key: "mileage", label: "마일리지" },
  { key: "registered_at", label: "등록일" },
  { key: "first_use_at", label: "이용 시작일" },
  { key: "marketing_consent", label: "광고성 수신 동의" },
];

export async function loadOpenMembers(centerId: number): Promise<OpenMemberRow[]> {
  type Base = {
    id: number;
    name: string;
    phone: string | null;
    gender: string | null;
    birth: string | null;
    mileage: number | null;
    marketing_consent: boolean | null;
    registered_at: string | null;
    first_registered_at: string | null;
    first_use_at: string | null;
    total_paid_won: number;
    final_expire_at: string | null;
    last_purchase_at: string | null;
    last_attended_at: string | null;
  };
  const base = await pageAll<Base>((f, t) =>
    supabase
      .from("crm_members")
      .select(
        "id, name, phone, gender, birth, mileage, marketing_consent, registered_at, first_registered_at, first_use_at, total_paid_won, final_expire_at, last_purchase_at, last_attended_at"
      )
      .eq("center_id", centerId)
      .eq("status", "active")
      .order("id")
      .range(f, t)
  );
  if (!base.length) return [];
  const rich = await enrichMemberListDetail(base, { centerIds: [centerId], holdCenterId: centerId });
  const today = kstTodayYmd();

  return rich.map((m) => {
    // 회원 목록 [상태] 칩과 같은 규칙 — 홀딩 > 예정 > 만료 > 임박(7일) > 유효 (app/crm/members/page.tsx memberStatusChip)
    const eff = m.max_expires_at ?? m.final_expire_at ?? null;
    const status = m.on_hold
      ? "홀딩"
      : m.scheduled
        ? "예정"
        : !eff || eff < today
          ? "만료"
          : eff <= addDaysYmd(today, EXPIRING_DAYS)
            ? "임박"
            : "유효";
    const lessons = m.items.filter((it) => it.type === "lesson" && it.remaining !== null);
    return {
      member_id: m.id,
      name: m.name,
      phone: m.phone ? formatPhone(m.phone) : "",
      gender: m.gender ? GENDER_LABEL[m.gender] ?? m.gender : null,
      birth: m.birth,
      status,
      active_products: m.items
        .map((it) => {
          const kind = it.type === "membership" ? "회원권" : "수강권";
          const left = it.type === "lesson" && it.remaining !== null ? ` 남은 ${it.remaining}회` : "";
          const until = it.expires ? (it.expires === UNLIMITED ? " 무기한" : ` ~${it.expires}`) : "";
          return `${kind} ${it.kind}${left}${until}`;
        })
        .join(" / "),
      expires_at: expiryText(eff),
      days_left: eff && eff !== UNLIMITED ? daysBetween(today, eff) : null,
      remaining_sessions: lessons.length ? lessons.reduce((s, it) => s + (it.remaining ?? 0), 0) : null,
      on_hold: m.on_hold,
      outstanding_won: m.outstanding_won,
      locker: m.locker_label,
      last_attended_at: m.last_attended_at,
      last_purchase_at: m.last_purchase_at,
      total_paid_won: m.total_paid_won,
      mileage: m.mileage ?? 0,
      registered_at: m.first_registered_at ?? m.registered_at,
      first_use_at: m.first_use_at,
      marketing_consent: !!m.marketing_consent,
    };
  });
}

/* ── 회원권 · 수강권 ───────────────────────────────────── */

const PAY_METHOD_KO: Record<string, string> = { cash: "현금", card: "카드", transfer: "계좌이체", etc: "기타" };

/** 이용권 상태 — 환불 > (유효인데) 시작 전=예정 / 만료일 지남=만료 / 그 외 이용 중 */
function usageStatus(status: string, startDate: string | null, expiresAt: string | null, today: string): string {
  if (status === "refunded") return "환불";
  if (status !== "valid") return "만료";
  if (expiresAt && expiresAt < today) return "만료";
  if (startDate && startDate > today) return "예정";
  return "이용 중";
}

export type OpenMembershipRow = {
  membership_id: number;
  member_id: number;
  member_name: string | null;
  plan_name: string;
  status: string;
  start_date: string | null;
  expires_at: string | null;
  purchased_at: string | null;
  price_won: number;
  discount_won: number;
  outstanding_won: number;
  payment_method: string | null;
  seller: string | null;
};

export const OPEN_MEMBERSHIP_COLUMNS: CsvColumn<OpenMembershipRow>[] = [
  { key: "membership_id", label: "회원권번호" },
  { key: "member_id", label: "회원번호" },
  { key: "member_name", label: "회원 이름" },
  { key: "plan_name", label: "회원권" },
  { key: "status", label: "상태" },
  { key: "start_date", label: "시작일" },
  { key: "expires_at", label: "만료일" },
  { key: "purchased_at", label: "구매일" },
  { key: "price_won", label: "결제 금액" },
  { key: "discount_won", label: "할인" },
  { key: "outstanding_won", label: "미수금" },
  { key: "payment_method", label: "결제 방법" },
  { key: "seller", label: "판매 직원" },
];

export async function loadOpenMemberships(centerId: number, onlyActive: boolean): Promise<OpenMembershipRow[]> {
  type R = {
    id: number;
    member_id: number;
    plan_name: string;
    status: string;
    start_date: string | null;
    expires_at: string | null;
    purchased_at: string | null;
    price_won: number | null;
    discount_won: number | null;
    outstanding_won: number | null;
    payment_method: string | null;
    payment_method_custom: string | null;
    seller_member_id: number | null;
  };
  const [rows, names, staff] = await Promise.all([
    pageAll<R>((f, t) => {
      let q = supabase
        .from("crm_memberships")
        .select(
          "id, member_id, plan_name, status, start_date, expires_at, purchased_at, price_won, discount_won, outstanding_won, payment_method, payment_method_custom, seller_member_id"
        )
        .eq("center_id", centerId);
      if (onlyActive) q = q.eq("status", "valid").gte("expires_at", kstTodayYmd());
      return q.order("id", { ascending: false }).range(f, t);
    }),
    memberNames(centerId),
    staffNames(centerId),
  ]);
  const today = kstTodayYmd();
  return rows.map((r) => ({
    membership_id: r.id,
    member_id: r.member_id,
    member_name: names.get(r.member_id) ?? null,
    plan_name: r.plan_name,
    status: usageStatus(r.status, r.start_date, r.expires_at, today),
    start_date: r.start_date,
    expires_at: expiryText(r.expires_at),
    purchased_at: r.purchased_at,
    price_won: r.price_won ?? 0,
    discount_won: r.discount_won ?? 0,
    outstanding_won: r.outstanding_won ?? 0,
    payment_method: r.payment_method === "etc" && r.payment_method_custom ? r.payment_method_custom : PAY_METHOD_KO[r.payment_method ?? ""] ?? r.payment_method,
    seller: r.seller_member_id ? staff.get(r.seller_member_id) ?? null : null,
  }));
}

export type OpenPassRow = {
  pass_id: number;
  member_id: number;
  member_name: string | null;
  lesson_kind: string;
  status: string;
  total_sessions: number;
  remaining_sessions: number | null;
  service_sessions: number;
  start_date: string | null;
  expires_at: string | null;
  issued_at: string | null;
  trainer: string | null;
  price_won: number;
  discount_won: number;
  outstanding_won: number;
  payment_method: string | null;
};

export const OPEN_PASS_COLUMNS: CsvColumn<OpenPassRow>[] = [
  { key: "pass_id", label: "수강권번호" },
  { key: "member_id", label: "회원번호" },
  { key: "member_name", label: "회원 이름" },
  { key: "lesson_kind", label: "수강권" },
  { key: "status", label: "상태" },
  { key: "total_sessions", label: "총 횟수" },
  { key: "remaining_sessions", label: "남은 횟수" },
  { key: "service_sessions", label: "서비스 횟수" },
  { key: "start_date", label: "시작일" },
  { key: "expires_at", label: "만료일" },
  { key: "issued_at", label: "발급일" },
  { key: "trainer", label: "담당 강사" },
  { key: "price_won", label: "결제 금액" },
  { key: "discount_won", label: "할인" },
  { key: "outstanding_won", label: "미수금" },
  { key: "payment_method", label: "결제 방법" },
];

export async function loadOpenPasses(centerId: number, onlyActive: boolean): Promise<OpenPassRow[]> {
  type R = {
    id: number;
    member_id: number;
    lesson_kind: string;
    status: string;
    total_sessions: number | null;
    remaining_sessions: number | null;
    service_sessions: number | null;
    start_date: string | null;
    expires_at: string | null;
    issued_at: string | null;
    trainer_member_id: number | null;
    price_won: number | null;
    discount_won: number | null;
    outstanding_won: number | null;
    payment_method: string | null;
    payment_method_custom: string | null;
  };
  const [rows, names, staff] = await Promise.all([
    pageAll<R>((f, t) => {
      let q = supabase
        .from("crm_passes")
        .select(
          "id, member_id, lesson_kind, status, total_sessions, remaining_sessions, service_sessions, start_date, expires_at, issued_at, trainer_member_id, price_won, discount_won, outstanding_won, payment_method, payment_method_custom"
        )
        .eq("center_id", centerId);
      if (onlyActive) q = q.eq("status", "valid").gte("expires_at", kstTodayYmd());
      return q.order("id", { ascending: false }).range(f, t);
    }),
    memberNames(centerId),
    staffNames(centerId),
  ]);
  const today = kstTodayYmd();
  return rows
    .map((r) => {
      const isCount = (r.total_sessions ?? 0) > 0;
      let status = usageStatus(r.status, r.start_date, r.expires_at, today);
      // 횟수제를 다 쓴 수강권은 '이용 가능 상품'에서 빠진다 (회원 목록과 같은 규칙)
      if (status === "이용 중" && isCount && (r.remaining_sessions ?? 0) <= 0) status = "소진";
      return {
        pass_id: r.id,
        member_id: r.member_id,
        member_name: names.get(r.member_id) ?? null,
        lesson_kind: r.lesson_kind,
        status,
        total_sessions: r.total_sessions ?? 0,
        remaining_sessions: isCount ? r.remaining_sessions ?? 0 : null,
        service_sessions: r.service_sessions ?? 0,
        start_date: r.start_date,
        expires_at: expiryText(r.expires_at),
        issued_at: r.issued_at,
        trainer: r.trainer_member_id ? staff.get(r.trainer_member_id) ?? null : null,
        price_won: r.price_won ?? 0,
        discount_won: r.discount_won ?? 0,
        outstanding_won: r.outstanding_won ?? 0,
        payment_method: r.payment_method === "etc" && r.payment_method_custom ? r.payment_method_custom : PAY_METHOD_KO[r.payment_method ?? ""] ?? r.payment_method,
      };
    })
    .filter((r) => !onlyActive || r.status !== "소진");
}

/* ── 매출 ─────────────────────────────────────────────── */

export type OpenSaleRow = {
  paid_at: string | null;
  member_id: number | null;
  member_name: string | null;
  product_name: string;
  category: string;
  amount_won: number;
  payment_method: string | null;
  registration_type: string | null;
};

export const OPEN_SALE_COLUMNS: CsvColumn<OpenSaleRow>[] = [
  { key: "paid_at", label: "결제 일시" },
  { key: "member_id", label: "회원번호" },
  { key: "member_name", label: "회원 이름" },
  { key: "product_name", label: "상품" },
  { key: "category", label: "구분" },
  { key: "amount_won", label: "금액" },
  { key: "payment_method", label: "결제 방법" },
  { key: "registration_type", label: "신규/재등록" },
];

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const YM_RE = /^\d{4}-\d{2}$/;
/** 한 번에 받을 수 있는 최대 기간 */
export const SALES_MAX_DAYS = 366;
export const MONTHLY_MAX_MONTHS = 36;

/** ?from=&to= (YYYY-MM-DD, 둘 다 포함). 없으면 이번 달 1일 ~ 오늘 */
export function parseDayRange(url: URL): { from: string; to: string } | { error: string } {
  const today = kstTodayYmd();
  const from = url.searchParams.get("from") || `${today.slice(0, 7)}-01`;
  const to = url.searchParams.get("to") || today;
  if (!YMD_RE.test(from) || !YMD_RE.test(to) || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) {
    return { error: "from·to 는 2026-11-01 처럼 YYYY-MM-DD 로 적어 주세요." };
  }
  if (to < from) return { error: "to 가 from 보다 앞이에요." };
  if (daysBetween(from, to) + 1 > SALES_MAX_DAYS) return { error: `한 번에 ${SALES_MAX_DAYS}일까지 받을 수 있어요. 기간을 나눠 주세요.` };
  return { from, to };
}

/** ?from=&to= (YYYY-MM, 둘 다 포함). 없으면 최근 12개월(이번 달 포함) */
export function parseMonthRange(url: URL): { from: string; to: string } | { error: string } {
  const thisYm = kstTodayYmd().slice(0, 7);
  const [y, m] = thisYm.split("-").map(Number);
  const back = new Date(Date.UTC(y, m - 1 - 11, 1)).toISOString().slice(0, 7);
  const from = url.searchParams.get("from") || back;
  const to = url.searchParams.get("to") || thisYm;
  if (!YM_RE.test(from) || !YM_RE.test(to)) return { error: "from·to 는 2026-01 처럼 YYYY-MM 으로 적어 주세요." };
  if (to < from) return { error: "to 가 from 보다 앞이에요." };
  if (monthsBetween(from, to) + 1 > MONTHLY_MAX_MONTHS) return { error: `한 번에 ${MONTHLY_MAX_MONTHS}개월까지 받을 수 있어요.` };
  return { from, to };
}

function monthsBetween(fromYm: string, toYm: string): number {
  const [fy, fm] = fromYm.split("-").map(Number);
  const [ty, tm] = toYm.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}
function nextMonthYm(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
}

export async function loadOpenSales(centerId: number, fromYmd: string, toYmd: string): Promise<OpenSaleRow[]> {
  const items = await loadSalesListItems(centerId, fromYmd, addDaysYmd(toYmd, 1));
  return items.map((it) => ({
    paid_at: kstYmdHm(it.date),
    member_id: it.member_id,
    member_name: it.member_name,
    product_name: it.product_name,
    category: it.category,
    amount_won: it.amount_won,
    payment_method: it.payment_method,
    registration_type: it.registration_type,
  }));
}

export type OpenMonthlyRow = {
  month: string;
  total_won: number;
  count: number;
  membership_won: number;
  lesson_won: number;
  apparel_won: number;
  locker_won: number;
  other_won: number;
};

export const OPEN_MONTHLY_COLUMNS: CsvColumn<OpenMonthlyRow>[] = [
  { key: "month", label: "월" },
  { key: "total_won", label: "매출 합계" },
  { key: "count", label: "결제 건수" },
  { key: "membership_won", label: "회원권" },
  { key: "lesson_won", label: "수강권" },
  { key: "apparel_won", label: "운동복" },
  { key: "locker_won", label: "락커" },
  { key: "other_won", label: "기타" },
];

const CATEGORY_FIELD: Record<string, keyof OpenMonthlyRow> = {
  회원권: "membership_won",
  수강권: "lesson_won",
  운동복: "apparel_won",
  락커: "locker_won",
};

export async function loadOpenMonthly(centerId: number, fromYm: string, toYm: string): Promise<OpenMonthlyRow[]> {
  const items = await loadSalesListItems(centerId, `${fromYm}-01`, `${nextMonthYm(toYm)}-01`);
  const rows = new Map<string, OpenMonthlyRow>();
  for (let ym = fromYm; ym <= toYm; ym = nextMonthYm(ym)) {
    rows.set(ym, { month: ym, total_won: 0, count: 0, membership_won: 0, lesson_won: 0, apparel_won: 0, locker_won: 0, other_won: 0 });
  }
  for (const it of items) {
    const ym = new Date(new Date(it.date).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 7);
    const row = rows.get(ym);
    if (!row) continue;
    const amt = it.amount_won ?? 0;
    row.total_won += amt;
    row.count += 1;
    const field = CATEGORY_FIELD[it.category] ?? "other_won";
    (row[field] as number) += amt;
  }
  return Array.from(rows.values());
}

/* ── 응답 ─────────────────────────────────────────────── */

/**
 * ?format=csv 면 CSV(엑셀·시트), 아니면 JSON { center, count, generated_at, ...meta, data }.
 * 🚨 캐시 금지 — 키별 응답이라 공용 캐시에 남으면 안 된다.
 */
export function openApiResponse<T>(
  url: URL,
  opts: { name: string; centerName: string; columns: CsvColumn<T>[]; rows: T[]; meta?: Record<string, unknown> }
): NextResponse {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if ((url.searchParams.get("format") || "").toLowerCase() === "csv") {
    headers["Content-Type"] = "text/csv; charset=utf-8";
    headers["Content-Disposition"] = `attachment; filename="moducm-${opts.name}-${kstTodayYmd()}.csv"`;
    return new NextResponse(toCsv(opts.columns, opts.rows), { status: 200, headers });
  }
  return NextResponse.json(
    {
      center: opts.centerName,
      count: opts.rows.length,
      generated_at: new Date().toISOString(),
      ...opts.meta,
      columns: opts.columns.map((c) => ({ key: c.key, label: c.label })),
      data: opts.rows,
    },
    { headers }
  );
}
