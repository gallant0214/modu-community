import { supabase } from "@/app/lib/supabase";

/**
 * 자동 메세지 회원 매칭 엔진.
 * 각 트리거를 실제 회원 데이터(회원권/수강권 만료, 생일, 장기미출석, 신규·재등록)에 맞춰
 * 대상 회원을 산출한다. 예약/계약/구매 즉시류 등 '이벤트 기반' 트리거는 발생 시점 hook 이 필요해
 * 이 스캔 엔진에서는 제외(추후 phase).
 */

export interface Match {
  member_id: number;
  name: string;
  product?: string;
  expiry?: string;
  price?: number;
}

export interface TriggerSetting {
  trigger_key: string;
  send_basis: string;
  send_days: number | null;
  send_count: number | null;
  /** 기준일 방향(생일 등): 기준일 전(before, 기본) / 후(after) */
  send_days_dir?: "before" | "after";
}

/** 스캔(데이터 기반)으로 대상 산출이 가능한 트리거 */
export const SCAN_TRIGGERS = new Set<string>([
  "birthday",
  "membership_expiring",
  "membership_expired",
  "pass_expiring",
  "pass_expired",
  "class_expiring",
  "class_expired",
  "locker_expiring",
  "locker_expired",
  "sportswear_expiring",
  "sportswear_expired",
  "long_absence",
  "membership_new",
  "membership_renew",
]);

/** 만료 임박(#전송기준# 잔여일 계산) 트리거 */
const EXPIRING_TRIGGERS = new Set<string>([
  "membership_expiring",
  "pass_expiring",
  "class_expiring",
  "locker_expiring",
  "sportswear_expiring",
]);
/** 만료 당일/후 트리거 */
const EXPIRED_TRIGGERS = new Set<string>([
  "membership_expired",
  "pass_expired",
  "class_expired",
  "locker_expired",
  "sportswear_expired",
]);

/* ─── KST 날짜 헬퍼 ─────────────────────────────── */
function kstNow(): Date {
  return new Date(Date.now() + 9 * 3600 * 1000);
}
export function kstYmd(): string {
  return kstNow().toISOString().slice(0, 10);
}
function ymdOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function mmdd(ymd: string): string {
  return ymd.slice(5, 10);
}

async function paginateAll<T>(
  build: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let page = 0; page < 1000; page++) {
    const from = page * size;
    const { data, error } = await build(from, from + size - 1);
    if (error || !data) break;
    out.push(...data);
    if (data.length < size) break;
  }
  return out;
}

/* ─── 원천 데이터 로더 ──────────────────────────── */
interface MemberLite {
  id: number;
  name: string;
  birth: string | null;
  last_attended_at: string | null;
}
interface DatedRow {
  member_id: number;
  expires_at: string;
  label: string;
  created_at: string;
  price?: number;
}

async function loadMembers(centerId: number): Promise<Map<number, MemberLite>> {
  const rows = await paginateAll<MemberLite>(async (f, t) => {
    const r = await supabase
      .from("crm_members")
      .select("id, name, birth, last_attended_at")
      .eq("center_id", centerId)
      .eq("status", "active")
      .range(f, t);
    return { data: r.data as MemberLite[] | null, error: r.error };
  });
  return new Map(rows.map((m) => [m.id, m]));
}

async function loadDated(
  centerId: number,
  table: "crm_memberships" | "crm_passes",
  labelCol: "plan_name" | "lesson_kind"
): Promise<DatedRow[]> {
  return paginateAll<DatedRow>(async (f, t) => {
    const r = await supabase
      .from(table)
      .select(`member_id, expires_at, created_at, price_won, ${labelCol}`)
      .eq("center_id", centerId)
      .range(f, t);
    const data = (r.data as Record<string, unknown>[] | null)?.map((x) => ({
      member_id: Number(x.member_id),
      expires_at: String(x.expires_at ?? ""),
      created_at: String(x.created_at ?? ""),
      label: String(x[labelCol] ?? ""),
      price: x.price_won != null ? Number(x.price_won) : undefined,
    })) as DatedRow[] | null;
    return { data, error: r.error };
  });
}

/** 회원별 가장 늦은 만료 행 */
function latestByMember(rows: DatedRow[]): Map<number, DatedRow> {
  const m = new Map<number, DatedRow>();
  for (const r of rows) {
    if (!r.expires_at) continue;
    const cur = m.get(r.member_id);
    if (!cur || r.expires_at > cur.expires_at) m.set(r.member_id, r);
  }
  return m;
}

/** 수강권 로드 (상품 type 분류 위해 product_id 포함) */
async function loadPasses(centerId: number): Promise<(DatedRow & { productId: number | null })[]> {
  return paginateAll<DatedRow & { productId: number | null }>(async (f, t) => {
    const r = await supabase
      .from("crm_passes")
      .select("member_id, expires_at, created_at, price_won, lesson_kind, product_id")
      .eq("center_id", centerId)
      .range(f, t);
    const data = (r.data as Record<string, unknown>[] | null)?.map((x) => ({
      member_id: Number(x.member_id),
      expires_at: String(x.expires_at ?? ""),
      created_at: String(x.created_at ?? ""),
      label: String(x.lesson_kind ?? ""),
      price: x.price_won != null ? Number(x.price_won) : undefined,
      productId: x.product_id != null ? Number(x.product_id) : null,
    })) as (DatedRow & { productId: number | null })[] | null;
    return { data, error: r.error };
  });
}

/** 대여권(운동복 등) 로드 */
async function loadRentals(centerId: number): Promise<DatedRow[]> {
  return paginateAll<DatedRow>(async (f, t) => {
    const r = await supabase
      .from("crm_rentals")
      .select("member_id, expires_at, created_at, price_won, item_name")
      .eq("center_id", centerId)
      .range(f, t);
    const data = (r.data as Record<string, unknown>[] | null)?.map((x) => ({
      member_id: Number(x.member_id),
      expires_at: String(x.expires_at ?? ""),
      created_at: String(x.created_at ?? ""),
      label: String(x.item_name ?? ""),
      price: x.price_won != null ? Number(x.price_won) : undefined,
    })) as DatedRow[] | null;
    return { data, error: r.error };
  });
}

/** 물리 락커(배정된 것) 로드 */
async function loadLockersDated(centerId: number): Promise<DatedRow[]> {
  return paginateAll<DatedRow>(async (f, t) => {
    const r = await supabase
      .from("crm_lockers")
      .select("assigned_member_id, expires_at, number, state")
      .eq("center_id", centerId)
      .eq("state", "assigned")
      .range(f, t);
    const data = (r.data as Record<string, unknown>[] | null)
      ?.filter((x) => x.assigned_member_id)
      .map((x) => ({
        member_id: Number(x.assigned_member_id),
        expires_at: String(x.expires_at ?? ""),
        created_at: "",
        label: `${x.number}번 락커`,
        price: undefined,
      })) as DatedRow[] | null;
    return { data, error: r.error };
  });
}

/** 상품 id → type 맵 (수강권/클래스 분류용) */
async function loadProductTypes(centerId: number): Promise<Map<number, string>> {
  const { data } = await supabase.from("crm_products").select("id, type").eq("center_id", centerId);
  return new Map(((data ?? []) as { id: number; type: string }[]).map((p) => [Number(p.id), String(p.type)]));
}

/** 상품관리에서 특정 type 으로 등록된 상품명 집합 (product_id 없는 대여권 분류용) */
async function loadProductNamesByType(centerId: number, type: string): Promise<Set<string>> {
  const { data } = await supabase
    .from("crm_products")
    .select("name, type")
    .eq("center_id", centerId)
    .eq("type", type);
  return new Set(((data ?? []) as { name: string }[]).map((p) => String(p.name)));
}

/** 만료 트리거 공통: 발송 대상 만료일(정확히 그 날). 일정=N일 전(before)/후(after), 즉시=당일 */
function targetExpiry(setting: TriggerSetting, today: string): string {
  const days = Math.max(0, setting.send_days ?? 0);
  const before = setting.send_days_dir !== "after";
  return setting.send_basis === "schedule" ? (before ? addDays(today, days) : addDays(today, -days)) : today;
}

/** 만료 트리거 공통: 회원별 최신 만료행 중 target 당일인 회원만 매칭 */
function matchExpiry(rows: DatedRow[], members: Map<number, MemberLite>, target: string): Match[] {
  const latest = latestByMember(rows);
  const out: Match[] = [];
  for (const [memberId, r] of latest) {
    const m = members.get(memberId);
    if (!m) continue;
    if (r.expires_at === target) {
      out.push({ member_id: memberId, name: m.name, product: r.label, expiry: r.expires_at, price: r.price });
    }
  }
  return out;
}

/* ─── 트리거 매칭 ───────────────────────────────── */
export async function computeMatches(centerId: number, setting: TriggerSetting): Promise<Match[]> {
  const key = setting.trigger_key;
  if (!SCAN_TRIGGERS.has(key)) return [];
  const today = kstYmd();
  const members = await loadMembers(centerId);

  // 생일 (기준일 전=생일 N일 전 발송 / 후=생일 N일 후 발송)
  if (key === "birthday") {
    const days = setting.send_basis === "schedule" ? setting.send_days ?? 0 : 0;
    const dir = setting.send_days_dir === "after" ? -1 : 1; // 전=미래 생일 매칭(+), 후=지난 생일 매칭(-)
    const target = mmdd(addDays(today, dir * days));
    const out: Match[] = [];
    for (const m of members.values()) {
      if (m.birth && mmdd(m.birth) === target) out.push({ member_id: m.id, name: m.name });
    }
    return out;
  }

  // 장기 미출석 — 정확히 N일째 미출석인 '그 날' 한 번만 (범위(<=)면 매일 중복 발송되므로 == 한정)
  if (key === "long_absence") {
    const days = Math.max(1, setting.send_days ?? setting.send_count ?? 14);
    const cutoff = addDays(today, -days);
    const out: Match[] = [];
    for (const m of members.values()) {
      const last = m.last_attended_at ? ymdOf(new Date(m.last_attended_at)) : null;
      if (last && last === cutoff) out.push({ member_id: m.id, name: m.name, expiry: last });
    }
    return out;
  }

  // 상품유형별 만료(회원권/수강권/클래스/락커/운동복) — 정확히 '그 날' 1회 매칭(자동발송 중복 방지).
  // 상품 구분은 상품관리(crm_products)의 type 기준. 기준=만료일(일정: N일 전/후, 즉시: 당일).
  if (EXPIRING_TRIGGERS.has(key) || EXPIRED_TRIGGERS.has(key)) {
    const target = targetExpiry(setting, today);

    // 회원권 → crm_memberships (전체)
    if (key.startsWith("membership_")) {
      return matchExpiry(await loadDated(centerId, "crm_memberships", "plan_name"), members, target);
    }
    // 수강권/클래스 → crm_passes. 상품 type=class 여부로 분리(수강권=class 제외, 상품 미연결 포함).
    if (key.startsWith("pass_") || key.startsWith("class_")) {
      const [passes, typeMap] = await Promise.all([loadPasses(centerId), loadProductTypes(centerId)]);
      const wantClass = key.startsWith("class_");
      const filtered = passes.filter((p) => {
        const t = p.productId != null ? typeMap.get(p.productId) : undefined;
        const isClass = t === "class";
        return wantClass ? isClass : !isClass;
      });
      return matchExpiry(filtered, members, target);
    }
    // 락커 → crm_lockers (배정된 물리 락커)
    if (key.startsWith("locker_")) {
      return matchExpiry(await loadLockersDated(centerId), members, target);
    }
    // 운동복 → crm_rentals 중 상품관리 apparel 상품명과 일치하는 것만
    if (key.startsWith("sportswear_")) {
      const apparelNames = await loadProductNamesByType(centerId, "apparel");
      const rentals = (await loadRentals(centerId)).filter((r) => apparelNames.has(r.label));
      return matchExpiry(rentals, members, target);
    }
  }

  // 신규/재등록 (오늘 생성된 회원권 기준)
  if (key === "membership_new" || key === "membership_renew") {
    const rows = await loadDated(centerId, "crm_memberships", "plan_name");
    const countByMember = new Map<number, number>();
    for (const r of rows) countByMember.set(r.member_id, (countByMember.get(r.member_id) ?? 0) + 1);
    const wantRenew = key === "membership_renew";
    const out: Match[] = [];
    for (const r of rows) {
      if (!r.created_at || ymdOf(new Date(r.created_at)) !== today) continue;
      const total = countByMember.get(r.member_id) ?? 1;
      const isRenew = total > 1;
      if (isRenew !== wantRenew) continue;
      const m = members.get(r.member_id);
      if (m) out.push({ member_id: r.member_id, name: m.name, product: r.label, expiry: r.expires_at, price: r.price });
    }
    return out;
  }

  return [];
}

/** 메세지 템플릿 치환 */
export function renderMessage(
  template: string,
  vars: {
    center: string;
    name: string;
    product?: string;
    expiry?: string;
    payment?: string;
    appLink?: string;
    basis?: string;
  }
): string {
  return (template || "")
    .replaceAll("#센터명#", vars.center)
    .replaceAll("#회원명#", vars.name)
    .replaceAll("#상품명#", vars.product ?? "")
    .replaceAll("#만료일#", vars.expiry ?? "")
    .replaceAll("#결제내역#", vars.payment ?? "")
    .replaceAll("#앱설치링크#", vars.appLink ?? "")
    .replaceAll("#전송기준#", vars.basis ?? "");
}

/** 두 YYYY-MM-DD 사이 일수(b-a). */
export function daysBetween(a: string, b: string): number {
  const t1 = new Date(`${a}T00:00:00Z`).getTime();
  const t2 = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((t2 - t1) / (24 * 3600 * 1000));
}

/**
 * #전송기준# 값 — 만료 임박 트리거는 회원별 실제 잔여일("10일"),
 * 그 외 스케줄/횟수 기준은 설정값("N일"/"N회"), 즉시는 빈 문자열.
 */
export function basisText(
  triggerKey: string,
  setting: { send_basis: string; send_days: number | null; send_count: number | null },
  today: string,
  expiry?: string
): string {
  if (EXPIRING_TRIGGERS.has(triggerKey) && expiry) {
    return `${Math.max(0, daysBetween(today, expiry))}일`;
  }
  if (EXPIRED_TRIGGERS.has(triggerKey)) return "0일";
  if (setting.send_basis === "schedule" && setting.send_days != null) return `${setting.send_days}일`;
  if (setting.send_basis === "count" && setting.send_count != null) return `${setting.send_count}회`;
  return "";
}

/** #결제내역# 용 문자열: "상품명 300,000원" (가격 없으면 상품명만) */
export function paymentText(product?: string, price?: number): string {
  const amount = price != null && Number.isFinite(price) ? `${price.toLocaleString()}원` : "";
  return [product, amount].filter(Boolean).join(" ");
}

export async function loadCenterName(centerId: number): Promise<string> {
  const { data } = await supabase.from("crm_centers").select("name").eq("id", centerId).maybeSingle();
  return (data as { name?: string } | null)?.name ?? "";
}

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN || "https://moducm.com";

/** #앱설치링크# 용: 센터 회원가입 링크(회원앱 설치 + 해당 센터 연결). 없으면 빈 문자열. */
export async function loadJoinLink(centerId: number): Promise<string> {
  const { data } = await supabase
    .from("crm_center_join_links")
    .select("token")
    .eq("center_id", centerId)
    .maybeSingle();
  const token = (data as { token?: string } | null)?.token;
  return token ? `${APP_ORIGIN}/join/${token}` : "";
}
