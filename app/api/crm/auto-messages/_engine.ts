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
  "long_absence",
  "membership_new",
  "membership_renew",
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

  // 장기 미출석
  if (key === "long_absence") {
    const days = setting.send_days ?? setting.send_count ?? 14;
    const cutoff = addDays(today, -Math.max(1, days));
    const out: Match[] = [];
    for (const m of members.values()) {
      const last = m.last_attended_at ? ymdOf(new Date(m.last_attended_at)) : null;
      if (last && last <= cutoff) out.push({ member_id: m.id, name: m.name, expiry: last });
    }
    return out;
  }

  // 회원권/수강권 만료(전/당일)
  if (key === "membership_expiring" || key === "membership_expired" || key === "pass_expiring" || key === "pass_expired") {
    const isPass = key.startsWith("pass");
    const rows = await loadDated(centerId, isPass ? "crm_passes" : "crm_memberships", isPass ? "lesson_kind" : "plan_name");
    const latest = latestByMember(rows);
    const expiring = key.endsWith("expiring");
    const days = expiring ? Math.max(1, setting.send_days ?? 7) : 0;
    const to = addDays(today, days);
    const out: Match[] = [];
    for (const [memberId, r] of latest) {
      const m = members.get(memberId);
      if (!m) continue;
      const ok = expiring ? r.expires_at >= today && r.expires_at <= to : r.expires_at === today;
      if (ok) out.push({ member_id: memberId, name: m.name, product: r.label, expiry: r.expires_at, price: r.price });
    }
    return out;
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
  if ((triggerKey === "membership_expiring" || triggerKey === "pass_expiring") && expiry) {
    return `${Math.max(0, daysBetween(today, expiry))}일`;
  }
  if (triggerKey === "membership_expired" || triggerKey === "pass_expired") return "0일";
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
