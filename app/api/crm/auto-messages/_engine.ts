import { supabase } from "@/app/lib/supabase";
import { benefitText, type CouponDef } from "@/app/lib/crm-coupons";
import { fillCouponVars, fmtExpiry, type CouponVars } from "@/app/lib/crm-auto-coupon-vars";

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
  /** 대상 상품의 만료일 (#만료일#). 상품이 없는 트리거는 비워 둔다. */
  expiry?: string;
  price?: number;
  /** 마지막 출석일 (#마지막방문일#) — 장기 미출석 알림용 */
  lastVisit?: string;
  /** 이용권 기간 중 출석한 날짜 수 (#출석일수#) — 출석일수 쿠폰용 */
  attendDays?: number;
  /** 이 건에 붙일 쿠폰 (규칙별로 쿠폰이 다른 트리거). 없으면 설정의 06 쿠폰 첨부를 쓴다 */
  couponId?: number;
  /** 중복 방지 키를 트리거가 직접 정할 때 (기본: trigger:member:오늘) */
  dedupeKey?: string;
  /** 대상 상품 시작일 (#시작일#) */
  startDate?: string;
  /** 수강권 남은 횟수 (#잔여횟수#) */
  remaining?: number;
  /** 수강권 담당 강사 (#담당강사#) */
  trainerName?: string;
  /** 회원 출석번호 (#회원번호#) */
  memberNo?: string;
  /** 보유 마일리지 (#마일리지#) */
  mileage?: number;
  /** 남은 미수금 합계 (#미수금#) */
  outstanding?: number;
  /** 누적 출석일수 (#총출석#) */
  totalAttend?: number;
  /** 다음 예약 수업 (#다음수업#) 예: "11/08(토) 14:00" */
  nextLesson?: string;
  /** 센터 첫 등록일 (#가입일#) */
  joinDate?: string;
  /** 홀딩 시작일·종료일 (#홀딩시작일# #홀딩종료일#) — 홀딩 알림에서만 */
  holdStart?: string;
  holdEnd?: string;
  /** 회원이 이미 갖고 있는 쿠폰 정보(#쿠폰명# 등) — 쿠폰 만료 알림에서만. 새 쿠폰을 발급하지 않는다 */
  couponVars?: CouponVars;
}

export interface TriggerSetting {
  trigger_key: string;
  send_basis: string;
  send_days: number | null;
  send_count: number | null;
  /** 기준일 방향(생일 등): 기준일 전(before, 기본) / 후(after) */
  send_days_dir?: "before" | "after";
  /** 수강권 만료 판정: 기간 만료(period, 기본) / 횟수 소진(sessions) */
  expiry_basis?: "period" | "sessions";
  /** 출석일수 기준 쿠폰 전송 규칙 (attendance_coupon) */
  attendance_rules?: { product_id: number; max_days: number; coupon_id: number }[];
  /** 출석일수 쿠폰: 출석 0일 회원은 보내지 않는다(출석 체크 없이 다니는 단골이 섞여 있음) */
  exclude_zero_attendance?: boolean;
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
  "attendance_coupon",
  "hold_ending_soon",
  "coupon_expired",
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
  attendance_no: string | null;
  mileage: number | null;
  first_registered_at: string | null;
  registered_at: string | null;
}
interface DatedRow {
  member_id: number;
  expires_at: string;
  label: string;
  created_at: string;
  price?: number;
  /** 행 상태 — 환불·취소·삭제 건은 만료 알림 대상에서 제외한다 */
  status?: string;
  /** 상품 시작일 (#시작일#) */
  start?: string;
  /** 수강권 전용 부가 정보 */
  remaining?: number;
  trainerMemberId?: number | null;
}

async function loadMembers(centerId: number): Promise<Map<number, MemberLite>> {
  const rows = await paginateAll<MemberLite>(async (f, t) => {
    const r = await supabase
      .from("crm_members")
      .select(
        "id, name, birth, last_attended_at, attendance_no, mileage, first_registered_at, registered_at"
      )
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
      .select(`member_id, expires_at, created_at, price_won, start_date, status, ${labelCol}`)
      .eq("center_id", centerId)
      .range(f, t);
    const data = (r.data as Record<string, unknown>[] | null)?.map((x) => ({
      member_id: Number(x.member_id),
      expires_at: String(x.expires_at ?? ""),
      created_at: String(x.created_at ?? ""),
      label: String(x[labelCol] ?? ""),
      price: x.price_won != null ? Number(x.price_won) : undefined,
      start: x.start_date ? String(x.start_date) : undefined,
      status: x.status != null ? String(x.status) : undefined,
    })) as DatedRow[] | null;
    return { data, error: r.error };
  });
}

/** 만료·소진 판정에서 제외할 상태(취소·환불·삭제) */
const DEAD_PASS_STATUS = new Set(["cancelled", "rejected", "refunded", "deleted"]);

/**
 * 회원별 가장 늦은 만료 행.
 * 🚨 환불·취소·삭제된 행은 건너뛴다. 예전엔 이걸 안 걸러서, 환불된 무기한(9999-12-31)
 *    이용권 한 건이 그 회원의 '가장 늦은 만료'로 잡혀 **실제 쓰는 이용권의 만료 알림이
 *    영구히 안 나가는** 회원이 생겼다(범어점 활성 회원 8명).
 */
function latestByMember(rows: DatedRow[]): Map<number, DatedRow> {
  const m = new Map<number, DatedRow>();
  for (const r of rows) {
    if (!r.expires_at) continue;
    if (r.status && DEAD_PASS_STATUS.has(r.status)) continue;
    const cur = m.get(r.member_id);
    if (!cur || r.expires_at > cur.expires_at) m.set(r.member_id, r);
  }
  return m;
}

/** 수강권 행 — 상품 type 분류(product_id)와 횟수 소진 판정(잔여/상태)에 필요한 값 포함 */
interface PassRow extends DatedRow {
  id: number;
  productId: number | null;
  remaining: number;
  status: string;
  issueType: string;
}

/** 수강권 로드 */
async function loadPasses(centerId: number): Promise<PassRow[]> {
  return paginateAll<PassRow>(async (f, t) => {
    const r = await supabase
      .from("crm_passes")
      .select(
        "id, member_id, expires_at, created_at, price_won, lesson_kind, product_id, remaining_sessions, status, issue_type, start_date, trainer_member_id"
      )
      .eq("center_id", centerId)
      .range(f, t);
    const data = (r.data as Record<string, unknown>[] | null)?.map((x) => ({
      id: Number(x.id),
      member_id: Number(x.member_id),
      expires_at: String(x.expires_at ?? ""),
      created_at: String(x.created_at ?? ""),
      label: String(x.lesson_kind ?? ""),
      price: x.price_won != null ? Number(x.price_won) : undefined,
      productId: x.product_id != null ? Number(x.product_id) : null,
      remaining: Number(x.remaining_sessions ?? 0),
      status: String(x.status ?? ""),
      issueType: String(x.issue_type ?? ""),
      start: x.start_date ? String(x.start_date) : undefined,
      trainerMemberId: x.trainer_member_id != null ? Number(x.trainer_member_id) : null,
    })) as PassRow[] | null;
    return { data, error: r.error };
  });
}

/** 대여권(운동복 등) 로드 */
async function loadRentals(centerId: number): Promise<DatedRow[]> {
  return paginateAll<DatedRow>(async (f, t) => {
    const r = await supabase
      .from("crm_rentals")
      .select("member_id, expires_at, created_at, price_won, item_name, status")
      .eq("center_id", centerId)
      .range(f, t);
    const data = (r.data as Record<string, unknown>[] | null)?.map((x) => ({
      member_id: Number(x.member_id),
      expires_at: String(x.expires_at ?? ""),
      created_at: String(x.created_at ?? ""),
      label: String(x.item_name ?? ""),
      price: x.price_won != null ? Number(x.price_won) : undefined,
      status: x.status != null ? String(x.status) : undefined,
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

/** 직원 id → 이름 (#담당강사#) */
async function loadStaffNames(centerId: number): Promise<Map<number, string>> {
  const { data } = await supabase
    .from("crm_center_members")
    .select("id, display_name")
    .eq("center_id", centerId);
  return new Map(
    ((data ?? []) as { id: number; display_name: string }[]).map((r) => [Number(r.id), String(r.display_name)])
  );
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
function matchExpiry(
  rows: DatedRow[],
  members: Map<number, MemberLite>,
  target: string,
  staffNames?: Map<number, string>
): Match[] {
  const latest = latestByMember(rows);
  const out: Match[] = [];
  for (const [memberId, r] of latest) {
    const m = members.get(memberId);
    if (!m) continue;
    if (r.expires_at === target) {
      out.push({
        member_id: memberId,
        name: m.name,
        product: r.label,
        expiry: r.expires_at,
        price: r.price,
        startDate: r.start,
        remaining: r.remaining,
        memberNo: m.attendance_no ?? undefined,
        mileage: m.mileage ?? undefined,
        trainerName:
          r.trainerMemberId && staffNames ? staffNames.get(r.trainerMemberId) ?? undefined : undefined,
      });
    }
  }
  return out;
}

/**
 * 홀딩 종료 임박 — 홀딩(crm_pauses) 종료일이 target 인 회원.
 *
 * 한 번 홀딩하면 회원권·수강권·대여권(락커·운동복)이 묶음으로 같이 홀딩돼 행이 여러 개 생긴다
 * (같은 회원·같은 종료일). 회원 1명당 1건으로 묶고 #상품명# 에 홀딩된 상품을 모두 적는다.
 *  - 조기 해제(cancelled)는 제외. 종료일 '후' 발송이면 크론이 이미 ended 로 마감했을 수 있어 같이 본다.
 *  - #만료일# = 홀딩 연장이 반영된 상품 만료일(회원권 우선), #전송기준# = 홀딩 종료일까지 남은 일수.
 *  - 중복 방지 키는 '홀딩 종료일' 기준 — 같은 홀딩에 한 번만. 종료일을 바꾸면 새 날짜로 다시 나간다.
 */
async function matchHoldEnding(
  centerId: number,
  members: Map<number, MemberLite>,
  target: string
): Promise<Match[]> {
  type PauseRow = {
    member_id: number;
    start_date: string;
    end_date: string;
    membership_id: number | null;
    pass_id: number | null;
    rental_id: number | null;
  };
  const pauses = await paginateAll<PauseRow>(async (f, t) => {
    const r = await supabase
      .from("crm_pauses")
      .select("member_id, start_date, end_date, membership_id, pass_id, rental_id")
      .eq("center_id", centerId)
      .eq("end_date", target)
      .in("status", ["active", "ended"])
      .order("id", { ascending: true })
      .range(f, t);
    return { data: r.data as PauseRow[] | null, error: r.error };
  });
  if (pauses.length === 0) return [];

  const ids = (k: "membership_id" | "pass_id" | "rental_id") =>
    Array.from(new Set(pauses.map((p) => p[k]).filter((v): v is number => v != null)));
  const [mIds, pIds, rIds] = [ids("membership_id"), ids("pass_id"), ids("rental_id")];
  type Item = { id: number; label: string; expires_at: string | null; status: string | null };
  const pick = async (table: string, col: string, list: number[]): Promise<Map<number, Item>> => {
    if (list.length === 0) return new Map();
    const { data } = await supabase
      .from(table as "crm_memberships")
      .select(`id, ${col}, expires_at, status`)
      .eq("center_id", centerId)
      .in("id", list);
    return new Map(
      ((data ?? []) as unknown as Record<string, unknown>[]).map((x) => [
        Number(x.id),
        {
          id: Number(x.id),
          label: String(x[col] ?? ""),
          expires_at: x.expires_at ? String(x.expires_at) : null,
          status: x.status != null ? String(x.status) : null,
        },
      ])
    );
  };
  const [mships, passes, rentals] = await Promise.all([
    pick("crm_memberships", "plan_name", mIds),
    pick("crm_passes", "lesson_kind", pIds),
    pick("crm_rentals", "item_name", rIds),
  ]);

  const byMember = new Map<number, { start: string; end: string; items: Item[]; mainExpiry?: string }>();
  for (const p of pauses) {
    const item =
      p.membership_id != null
        ? mships.get(p.membership_id)
        : p.pass_id != null
          ? passes.get(p.pass_id)
          : p.rental_id != null
            ? rentals.get(p.rental_id)
            : undefined;
    // 홀딩 중에 환불·삭제된 상품은 안내하지 않는다
    if (!item || (item.status && DEAD_PASS_STATUS.has(item.status))) continue;
    const e = byMember.get(p.member_id) ?? { start: p.start_date, end: p.end_date, items: [] };
    if (p.start_date < e.start) e.start = p.start_date;
    if (!e.items.some((x) => x.label === item.label)) e.items.push(item);
    // 만료일: 회원권 > 수강권 > 대여권 순으로 첫 값
    if (!e.mainExpiry && item.expires_at && p.rental_id == null) e.mainExpiry = item.expires_at;
    byMember.set(p.member_id, e);
  }

  const out: Match[] = [];
  for (const [memberId, e] of byMember) {
    const m = members.get(memberId);
    if (!m || e.items.length === 0) continue;
    out.push({
      member_id: memberId,
      name: m.name,
      product: e.items.map((x) => x.label).filter(Boolean).join(", "),
      expiry: e.mainExpiry ?? e.items[0].expires_at ?? undefined,
      holdStart: e.start,
      holdEnd: e.end,
      memberNo: m.attendance_no ?? undefined,
      mileage: m.mileage ?? undefined,
      dedupeKey: `hold_ending_soon:${memberId}:${e.end}`,
    });
  }
  return out;
}

/**
 * 지정 수강권들 중 consumed(출석·노쇼로 차감) 예약이 있는 pass_id 집합.
 * starts_at(수업일) 기준 범위로 조회하며, id 목록은 300개씩 나눠 질의한다.
 */
async function consumedPassIds(
  centerId: number,
  passIds: number[],
  range: { gte?: string; lte?: string; gt?: string }
): Promise<Set<number>> {
  const out = new Set<number>();
  for (let i = 0; i < passIds.length; i += 300) {
    const chunk = passIds.slice(i, i + 300);
    const rows = await paginateAll<{ pass_id: number }>(async (f, t) => {
      let q = supabase
        .from("crm_reservations")
        .select("pass_id")
        .eq("center_id", centerId)
        .eq("consumed", true)
        .in("pass_id", chunk);
      if (range.gte) q = q.gte("starts_at", range.gte);
      if (range.lte) q = q.lte("starts_at", range.lte);
      if (range.gt) q = q.gt("starts_at", range.gt);
      const r = await q.range(f, t);
      return { data: r.data as { pass_id: number }[] | null, error: r.error };
    });
    rows.forEach((r) => out.add(Number(r.pass_id)));
  }
  return out;
}

/**
 * '횟수 소진' 기준 매칭 — target 날짜에 **마지막 남은 회차**를 써서 잔여 0이 된 회원.
 * 기간(만료일)과 무관하며, 소진일 = 그 회차를 차감한 예약의 수업일(starts_at, KST).
 * 서비스 세션(0원 별도 발급)과 취소·환불 수강권은 제외하고,
 * 아직 쓸 수 있는 다른 수강권이 남아 있는 회원도 제외한다(기간 기준의 '최신 1건' 규칙과 같은 취지).
 */
async function matchDepleted(
  centerId: number,
  passes: PassRow[],
  members: Map<number, MemberLite>,
  target: string,
  today: string,
  staffNames?: Map<number, string>
): Promise<Match[]> {
  const alive = passes.filter((p) => !DEAD_PASS_STATUS.has(p.status) && p.issueType !== "service");
  const depleted = alive.filter((p) => p.remaining <= 0);
  if (depleted.length === 0) return [];

  const dayStart = `${target}T00:00:00+09:00`;
  const dayEnd = `${target}T23:59:59.999+09:00`;
  const usedOnTarget = await consumedPassIds(centerId, depleted.map((p) => p.id), {
    gte: dayStart,
    lte: dayEnd,
  });
  const candidates = depleted.filter((p) => usedOnTarget.has(p.id));
  if (candidates.length === 0) return [];

  // target 이후에도 차감 이력이 있으면 그 날이 '마지막 회차'가 아니다
  const usedLater = await consumedPassIds(centerId, candidates.map((p) => p.id), { gt: dayEnd });

  // 잔여가 남아 있고 아직 기간도 남은 수강권 보유 회원은 '다 썼다' 안내 대상이 아니다
  const stillUsable = new Set(
    alive.filter((p) => p.remaining > 0 && (!p.expires_at || p.expires_at >= today)).map((p) => p.member_id)
  );

  const out: Match[] = [];
  const seen = new Set<number>();
  for (const p of candidates) {
    if (usedLater.has(p.id) || stillUsable.has(p.member_id) || seen.has(p.member_id)) continue;
    const m = members.get(p.member_id);
    if (!m) continue;
    seen.add(p.member_id);
    out.push({
      member_id: p.member_id,
      name: m.name,
      product: p.label,
      expiry: p.expires_at,
      price: p.price,
      startDate: p.start,
      remaining: p.remaining,
      memberNo: m.attendance_no ?? undefined,
      mileage: m.mileage ?? undefined,
      trainerName:
        p.trainerMemberId && staffNames ? staffNames.get(p.trainerMemberId) ?? undefined : undefined,
    });
  }
  return out;
}

/**
 * 쿠폰 만료 매칭 (coupon_expired).
 * 사용하지 않은 쿠폰(status 'issued') 중 사용 기한(expires_at = 쓸 수 있는 마지막 날)이 target 인 것.
 * 회원당 하루 1건 — 같은 날 여러 장이 끝나면 혜택이 큰(먼저 발급된) 한 장만 안내한다.
 * 중복 방지: 쿠폰 1장당 1회(`coupon_expired:{회원}:ci{발급id}`).
 * 🚨 쿠폰 변수(#쿠폰명# 등)는 **회원이 가진 그 쿠폰**으로 채운다 — 새 쿠폰을 발급하지 않는다.
 */
async function matchCouponExpiry(
  centerId: number,
  members: Map<number, MemberLite>,
  target: string
): Promise<Match[]> {
  const issues = await paginateAll<{ id: number; member_id: number; coupon_id: number; code: string; expires_at: string }>(
    async (f, t) => {
      const r = await supabase
        .from("crm_coupon_issues")
        .select("id, member_id, coupon_id, code, expires_at")
        .eq("center_id", centerId)
        .eq("status", "issued")
        .eq("expires_at", target)
        .order("id")
        .range(f, t);
      return { data: r.data as { id: number; member_id: number; coupon_id: number; code: string; expires_at: string }[] | null, error: r.error };
    }
  );
  if (issues.length === 0) return [];
  const couponIds = Array.from(new Set(issues.map((i) => Number(i.coupon_id))));
  const { data: defs } = await supabase.from("crm_coupons").select("*").in("id", couponIds);
  const byId = new Map(((defs ?? []) as CouponDef[]).map((c) => [Number(c.id), c]));

  const out: Match[] = [];
  const seen = new Set<number>();
  for (const i of issues) {
    const m = members.get(i.member_id);
    const c = byId.get(Number(i.coupon_id));
    if (!m || !c || seen.has(i.member_id)) continue;
    seen.add(i.member_id);
    out.push({
      member_id: i.member_id,
      name: m.name,
      product: c.name,
      expiry: i.expires_at,
      dedupeKey: `coupon_expired:${i.member_id}:ci${i.id}`,
      couponVars: { name: c.name, benefit: benefitText(c), code: i.code, expires: fmtExpiry(i.expires_at) },
      memberNo: m.attendance_no ?? undefined,
      mileage: m.mileage ?? undefined,
    });
  }
  return out;
}

/**
 * 출석일수 기준 쿠폰 전송 매칭 (attendance_coupon).
 *
 * 1) 설정한 규칙의 상품(crm_products.id)으로 발급된 회원권 중 **만료일이 target 당일**인 건을 찾는다.
 *    (일정 기준이면 '만료 N일 전/후' 그 날 하루만 → 자동 반복발송 방지)
 * 2) 그 이용권 기간(start_date ~ min(만료일, 오늘)) 안의 **출석한 날짜 수**를 센다.
 *    하루에 여러 번 와도 1일. 발송 시점까지만 세므로 만료 전 발송에서도 과소평가가 없다.
 * 3) 그 상품의 규칙 중 `출석일수 < max_days` 를 만족하는 줄 가운데 **max_days 가 가장 작은 줄**
 *    (= 혜택이 큰 쪽) 하나만 적용한다. 예) 7일 출석 → 8일 미만(30%)과 14일 미만(20%) 둘 다 해당 → 30%.
 * 4) 이미 다음 이용권을 산 회원(만료일 이후까지 유효한 회원권 보유)은 제외 — 재등록 유치가 목적이다.
 * 5) '출석 0일 제외'가 켜져 있으면 출석 0일 회원은 뺀다. 출석 체크 없이 다니는 단골이 섞여 있어서
 *    (재등록 회원 중 0일인 사람의 절반이 쿠폰 없이 재등록) 가장 큰 할인을 주면 손해다 — 2026-11-09 분석.
 *
 * 중복 방지: dedupe_key 를 회원권 id 기준으로 둬서 한 이용권당 1회만 나간다.
 */
async function matchAttendanceCoupon(
  centerId: number,
  setting: TriggerSetting,
  members: Map<number, MemberLite>,
  target: string,
  today: string
): Promise<Match[]> {
  const rules = (setting.attendance_rules ?? []).filter(
    (r) => r && r.product_id > 0 && r.max_days > 0 && r.coupon_id > 0
  );
  if (rules.length === 0) return [];

  // 상품 id → 그 상품 규칙(기준 일수 오름차순 = 혜택 큰 순)
  const byProduct = new Map<number, { max_days: number; coupon_id: number }[]>();
  for (const r of rules) {
    const list = byProduct.get(r.product_id) ?? [];
    list.push({ max_days: r.max_days, coupon_id: r.coupon_id });
    byProduct.set(r.product_id, list);
  }
  for (const list of byProduct.values()) list.sort((a, b) => a.max_days - b.max_days);

  // 규칙 상품명 — 회원권은 product_id 컬럼이 없어 plan_name 으로 맞춘다
  const { data: prodRows } = await supabase
    .from("crm_products")
    .select("id, name")
    .eq("center_id", centerId)
    .in("id", Array.from(byProduct.keys()));
  const nameToProduct = new Map<string, number>();
  for (const p of (prodRows ?? []) as { id: number; name: string }[]) {
    nameToProduct.set(String(p.name).trim(), Number(p.id));
  }
  if (nameToProduct.size === 0) return [];

  // 만료일이 target 인 회원권 (상품명 일치분만)
  const { data: mbRows } = await supabase
    .from("crm_memberships")
    .select("id, member_id, plan_name, price_won, start_date, expires_at, status")
    .eq("center_id", centerId)
    .eq("expires_at", target)
    .neq("status", "deleted");
  const targets = ((mbRows ?? []) as {
    id: number;
    member_id: number;
    plan_name: string | null;
    price_won: number | null;
    start_date: string | null;
    expires_at: string;
    status: string;
  }[]).filter((m) => m.status !== "refunded" && nameToProduct.has(String(m.plan_name ?? "").trim()));
  if (targets.length === 0) return [];

  // 이미 다음 이용권을 산 회원 제외 (만료일 이후까지 유효한 회원권·수강권 보유)
  const memberIds = Array.from(new Set(targets.map((m) => m.member_id)));
  const [laterMb, laterPass] = await Promise.all([
    supabase
      .from("crm_memberships")
      .select("member_id")
      .eq("center_id", centerId)
      .in("member_id", memberIds)
      .neq("status", "deleted")
      .neq("status", "refunded")
      .gt("expires_at", target),
    supabase
      .from("crm_passes")
      .select("member_id")
      .eq("center_id", centerId)
      .in("member_id", memberIds)
      .neq("status", "deleted")
      .neq("status", "refunded")
      .gt("expires_at", target),
  ]);
  const renewed = new Set<number>();
  for (const r of (laterMb.data ?? []) as { member_id: number }[]) renewed.add(Number(r.member_id));
  for (const r of (laterPass.data ?? []) as { member_id: number }[]) renewed.add(Number(r.member_id));

  const pending = targets.filter((m) => !renewed.has(m.member_id));
  if (pending.length === 0) return [];

  // 출석일수 — 이용권 기간(시작일 ~ min(만료일, 오늘)) 안의 '출석한 날짜' 수
  const windowStart = pending.reduce(
    (min, m) => (m.start_date && m.start_date < min ? m.start_date : min),
    today
  );
  const countEnd = target < today ? target : today;
  const attends = await paginateAll<{ member_id: number; checked_in_at: string }>(async (f, t) => {
    const r = await supabase
      .from("crm_attendances")
      .select("member_id, checked_in_at")
      .eq("center_id", centerId)
      .in("member_id", memberIds)
      .gte("checked_in_at", `${windowStart}T00:00:00+09:00`)
      .lt("checked_in_at", `${addDays(countEnd, 1)}T00:00:00+09:00`)
      .range(f, t);
    return { data: r.data as { member_id: number; checked_in_at: string }[] | null, error: r.error };
  });
  // 회원별 출석 '날짜' 집합 (KST)
  const daysByMember = new Map<number, Set<string>>();
  for (const a of attends) {
    const ymd = ymdOf(new Date(new Date(a.checked_in_at).getTime() + 9 * 3600 * 1000));
    const set = daysByMember.get(a.member_id) ?? new Set<string>();
    set.add(ymd);
    daysByMember.set(a.member_id, set);
  }

  const out: Match[] = [];
  for (const mb of pending) {
    const member = members.get(mb.member_id);
    if (!member) continue;
    const productId = nameToProduct.get(String(mb.plan_name ?? "").trim());
    const list = productId ? byProduct.get(productId) : undefined;
    if (!list || list.length === 0) continue;

    const from = mb.start_date ?? windowStart;
    const days = daysByMember.get(mb.member_id);
    let attendDays = 0;
    if (days) {
      for (const d of days) if (d >= from && d <= countEnd) attendDays += 1;
    }

    if (attendDays === 0 && setting.exclude_zero_attendance) continue;
    const hit = list.find((r) => attendDays < r.max_days);
    if (!hit) continue;

    out.push({
      member_id: mb.member_id,
      name: member.name,
      product: mb.plan_name ?? "",
      expiry: mb.expires_at,
      price: mb.price_won ?? undefined,
      attendDays,
      startDate: mb.start_date ?? undefined,
      memberNo: member.attendance_no ?? undefined,
      mileage: member.mileage ?? undefined,
      couponId: hit.coupon_id,
      dedupeKey: `attendance_coupon:${mb.member_id}:mb${mb.id}`,
    });
  }
  return out;
}

/**
 * 매칭 결과 공통 보강 — 미수금·누적 출석일수·다음 수업·가입일.
 * 트리거마다 따로 긁지 않고 **대상자만** 한 번에 조회한다(대상은 보통 수십 명).
 */
async function enrichMatches(
  centerId: number,
  matches: Match[],
  members: Map<number, MemberLite>
): Promise<Match[]> {
  if (matches.length === 0) return matches;
  const ids = Array.from(new Set(matches.map((m) => m.member_id)));

  const [mbDue, passDue, attends, nextRes] = await Promise.all([
    supabase
      .from("crm_memberships")
      .select("member_id, outstanding_won")
      .eq("center_id", centerId)
      .in("member_id", ids)
      .gt("outstanding_won", 0)
      .neq("status", "deleted")
      .neq("status", "refunded"),
    supabase
      .from("crm_passes")
      .select("member_id, outstanding_won")
      .eq("center_id", centerId)
      .in("member_id", ids)
      .gt("outstanding_won", 0)
      .neq("status", "deleted")
      .neq("status", "refunded"),
    paginateAll<{ member_id: number; checked_in_at: string }>(async (f, t) => {
      const r = await supabase
        .from("crm_attendances")
        .select("member_id, checked_in_at")
        .eq("center_id", centerId)
        .in("member_id", ids)
        .range(f, t);
      return { data: r.data as { member_id: number; checked_in_at: string }[] | null, error: r.error };
    }),
    supabase
      .from("crm_reservations")
      .select("member_id, starts_at")
      .eq("center_id", centerId)
      .in("member_id", ids)
      .eq("status", "booked")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true }),
  ]);

  const due = new Map<number, number>();
  for (const r of [...(mbDue.data ?? []), ...(passDue.data ?? [])] as {
    member_id: number;
    outstanding_won: number | null;
  }[]) {
    due.set(r.member_id, (due.get(r.member_id) ?? 0) + (r.outstanding_won ?? 0));
  }

  // 누적 출석일수 = 출석한 '날짜' 수 (하루 여러 번은 1일)
  const attendDays = new Map<number, Set<string>>();
  for (const a of attends) {
    const ymd = ymdOf(new Date(new Date(a.checked_in_at).getTime() + 9 * 3600 * 1000));
    const set = attendDays.get(a.member_id) ?? new Set<string>();
    set.add(ymd);
    attendDays.set(a.member_id, set);
  }

  const DOW = ["일", "월", "화", "수", "목", "금", "토"];
  const nextByMember = new Map<number, string>();
  for (const r of (nextRes.data ?? []) as { member_id: number; starts_at: string }[]) {
    if (nextByMember.has(r.member_id)) continue; // 가장 이른 1건
    const k = new Date(new Date(r.starts_at).getTime() + 9 * 3600 * 1000);
    const mm = String(k.getUTCMonth() + 1);
    const dd = String(k.getUTCDate());
    const hh = String(k.getUTCHours()).padStart(2, "0");
    const mi = String(k.getUTCMinutes()).padStart(2, "0");
    nextByMember.set(r.member_id, `${mm}/${dd}(${DOW[k.getUTCDay()]}) ${hh}:${mi}`);
  }

  for (const m of matches) {
    const mem = members.get(m.member_id);
    m.outstanding = due.get(m.member_id) ?? 0;
    m.totalAttend = attendDays.get(m.member_id)?.size ?? 0;
    m.nextLesson = nextByMember.get(m.member_id);
    // #마지막방문일# — 장기 미출석 외의 트리거에서도 값이 들어가게 한다(예전엔 빈칸)
    if (!m.lastVisit && mem?.last_attended_at) m.lastVisit = mem.last_attended_at.slice(0, 10);
    const join = mem?.first_registered_at ?? mem?.registered_at ?? null;
    m.joinDate = join ? join.slice(0, 10) : undefined;
  }
  return matches;
}

/**
 * 즉시형 자동 메세지(발급·결제 직후 발송)용 — 회원 1명의 공통 치환값.
 *
 * 🚨 스캔형(크론·지금 실행)과 **같은 보강 함수(enrichMatches)** 를 쓴다.
 *   예전엔 즉시형이 센터명·회원명·상품명·만료일·결제내역만 채워서,
 *   문구에 #마일리지# #회원번호# #센터전화# #미수금# #총출석# 같은 변수를 넣으면
 *   **그 자리가 빈칸으로 발송됐다**(스캔형에서는 정상 출력돼 재현이 어려웠다).
 */
export async function loadMemberCommonVars(
  centerId: number,
  memberId: number
): Promise<{
  memberNo?: string;
  mileage?: number;
  outstanding?: number;
  totalAttend?: number;
  nextLesson?: string;
  joinDate?: string;
  lastVisit?: string;
}> {
  const { data } = await supabase
    .from("crm_members")
    .select(
      "id, name, birth, last_attended_at, attendance_no, mileage, first_registered_at, registered_at"
    )
    .eq("center_id", centerId)
    .eq("id", memberId)
    .maybeSingle();
  const mem = data as MemberLite | null;
  if (!mem) return {};
  const [m] = await enrichMatches(
    centerId,
    [
      {
        member_id: memberId,
        name: mem.name,
        memberNo: mem.attendance_no ?? undefined,
        mileage: mem.mileage ?? undefined,
      },
    ],
    new Map([[memberId, mem]])
  );
  return {
    memberNo: m.memberNo,
    mileage: m.mileage,
    outstanding: m.outstanding,
    totalAttend: m.totalAttend,
    nextLesson: m.nextLesson,
    joinDate: m.joinDate,
    lastVisit: m.lastVisit,
  };
}

/* ─── 트리거 매칭 ───────────────────────────────── */
export async function computeMatches(centerId: number, setting: TriggerSetting): Promise<Match[]> {
  const key = setting.trigger_key;
  if (!SCAN_TRIGGERS.has(key)) return [];
  const members = await loadMembers(centerId);
  const matches = await matchTrigger(centerId, setting, members);
  // 미수금·누적 출석·다음 수업·가입일은 트리거와 무관한 공통 값 → 대상자만 한 번에 보강
  return enrichMatches(centerId, matches, members);
}

async function matchTrigger(
  centerId: number,
  setting: TriggerSetting,
  members: Map<number, MemberLite>
): Promise<Match[]> {
  const key = setting.trigger_key;
  const today = kstYmd();

  // 생일 (기준일 전=생일 N일 전 발송 / 후=생일 N일 후 발송)
  if (key === "birthday") {
    const days = setting.send_basis === "schedule" ? setting.send_days ?? 0 : 0;
    const dir = setting.send_days_dir === "after" ? -1 : 1; // 전=미래 생일 매칭(+), 후=지난 생일 매칭(-)
    const target = mmdd(addDays(today, dir * days));
    const out: Match[] = [];
    for (const m of members.values()) {
      if (m.birth && mmdd(m.birth) === target)
        out.push({
          member_id: m.id,
          name: m.name,
          memberNo: m.attendance_no ?? undefined,
          mileage: m.mileage ?? undefined,
        });
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
      // 마지막 출석일은 #만료일# 이 아니라 #마지막방문일# 로 전달 (상품 만료일과 혼동 방지)
      if (last && last === cutoff)
        out.push({
          member_id: m.id,
          name: m.name,
          lastVisit: last,
          memberNo: m.attendance_no ?? undefined,
          mileage: m.mileage ?? undefined,
        });
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
      const [passes, typeMap, staffNames] = await Promise.all([
        loadPasses(centerId),
        loadProductTypes(centerId),
        loadStaffNames(centerId),
      ]);
      const wantClass = key.startsWith("class_");
      const filtered = passes.filter((p) => {
        const t = p.productId != null ? typeMap.get(p.productId) : undefined;
        const isClass = t === "class";
        return wantClass ? isClass : !isClass;
      });
      // '수강권 만료 시' 는 만료 판정 기준을 고를 수 있다 — 기간 만료(기본) / 횟수 소진
      if (key === "pass_expired" && setting.expiry_basis === "sessions") {
        return matchDepleted(centerId, filtered, members, target, today, staffNames);
      }
      return matchExpiry(filtered, members, target, staffNames);
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

  // 쿠폰 만료 — 안 쓴 쿠폰의 사용 기한(마지막 사용일)이 target 인 회원. 즉시=기한 당일, 일정=N일 전/후
  if (key === "coupon_expired") {
    return matchCouponExpiry(centerId, members, targetExpiry(setting, today));
  }

  // 홀딩 종료 임박 — 홀딩 종료일 N일 전(또는 후)
  if (key === "hold_ending_soon") {
    return matchHoldEnding(centerId, members, targetExpiry(setting, today));
  }

  // 출석일수 기준 쿠폰 전송 — 지정 상품 회원권의 만료일이 target 인 회원 중,
  // 그 이용권 기간(시작일~오늘) 출석일수가 규칙 기준 미만인 사람에게 규칙별 쿠폰을 보낸다.
  if (key === "attendance_coupon") {
    return matchAttendanceCoupon(centerId, setting, members, targetExpiry(setting, today), today);
  }

  // 신규/재등록 (오늘 생성된 회원권 기준)
  if (key === "membership_new" || key === "membership_renew") {
    const rows = await loadDated(centerId, "crm_memberships", "plan_name");
    const countByMember = new Map<number, number>();
    for (const r of rows) countByMember.set(r.member_id, (countByMember.get(r.member_id) ?? 0) + 1);
    const wantRenew = key === "membership_renew";
    const out: Match[] = [];
    for (const r of rows) {
      // created_at 은 UTC. KST 로 변환해 비교하지 않으면 새벽(00~09시) 등록분이 누락된다.
      if (!r.created_at) continue;
      const createdKst = ymdOf(new Date(new Date(r.created_at).getTime() + 9 * 3600 * 1000));
      if (createdKst !== today) continue;
      const total = countByMember.get(r.member_id) ?? 1;
      const isRenew = total > 1;
      if (isRenew !== wantRenew) continue;
      const m = members.get(r.member_id);
      if (m)
        out.push({
          member_id: r.member_id,
          name: m.name,
          product: r.label,
          expiry: r.expires_at,
          price: r.price,
          startDate: r.start,
          memberNo: m.attendance_no ?? undefined,
          mileage: m.mileage ?? undefined,
        });
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
    lastVisit?: string;
    attendDays?: number;
    startDate?: string;
    remaining?: number;
    trainerName?: string;
    memberNo?: string;
    mileage?: number;
    centerPhone?: string;
    centerAddress?: string;
    centerHours?: string;
    outstanding?: number;
    totalAttend?: number;
    nextLesson?: string;
    joinDate?: string;
    holdStart?: string;
    holdEnd?: string;
    /** 회원이 가진 쿠폰으로 쿠폰 변수를 채울 때(쿠폰 만료 알림) */
    couponVars?: CouponVars;
  }
): string {
  const out = (template || "")
    .replaceAll("#센터명#", vars.center)
    .replaceAll("#회원명#", vars.name)
    .replaceAll("#상품명#", vars.product ?? "")
    .replaceAll("#만료일#", vars.expiry ?? "")
    .replaceAll("#마지막방문일#", vars.lastVisit ?? "")
    .replaceAll("#결제내역#", vars.payment ?? "")
    .replaceAll("#앱설치링크#", vars.appLink ?? "")
    .replaceAll("#전송기준#", vars.basis ?? "")
    .replaceAll("#출석일수#", vars.attendDays != null ? String(vars.attendDays) : "")
    .replaceAll("#시작일#", vars.startDate ?? "")
    .replaceAll("#잔여횟수#", vars.remaining != null ? String(vars.remaining) : "")
    .replaceAll("#담당강사#", vars.trainerName ?? "")
    .replaceAll("#회원번호#", vars.memberNo ?? "")
    .replaceAll("#마일리지#", vars.mileage != null ? vars.mileage.toLocaleString() : "")
    .replaceAll("#센터전화#", vars.centerPhone ?? "")
    .replaceAll("#센터주소#", vars.centerAddress ?? "")
    .replaceAll("#운영시간#", vars.centerHours ?? "")
    .replaceAll("#미수금#", vars.outstanding ? vars.outstanding.toLocaleString() : "0")
    .replaceAll("#총출석#", vars.totalAttend != null ? String(vars.totalAttend) : "")
    .replaceAll("#다음수업#", vars.nextLesson ?? "")
    .replaceAll("#가입일#", vars.joinDate ?? "")
    .replaceAll("#홀딩시작일#", vars.holdStart ?? "")
    .replaceAll("#홀딩종료일#", vars.holdEnd ?? "");
  return vars.couponVars ? fillCouponVars(out, vars.couponVars) : out;
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
 * 홀딩 종료 임박은 `expiry` 자리에 홀딩 종료일을 넘긴다(호출처: m.holdEnd ?? m.expiry).
 */
export function basisText(
  triggerKey: string,
  setting: { send_basis: string; send_days: number | null; send_count: number | null },
  today: string,
  expiry?: string
): string {
  if (
    (EXPIRING_TRIGGERS.has(triggerKey) ||
      triggerKey === "attendance_coupon" ||
      triggerKey === "hold_ending_soon" ||
      triggerKey === "coupon_expired") &&
    expiry
  ) {
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

/** #센터전화# 용 — 센터 대표 전화번호 */
export async function loadCenterPhone(centerId: number): Promise<string> {
  const { data } = await supabase.from("crm_centers").select("phone").eq("id", centerId).maybeSingle();
  return (data as { phone?: string | null } | null)?.phone ?? "";
}

/** #센터주소# */
export async function loadCenterAddress(centerId: number): Promise<string> {
  const { data } = await supabase.from("crm_centers").select("address").eq("id", centerId).maybeSingle();
  return (data as { address?: string | null } | null)?.address ?? "";
}

const HOURS_DAYS = ["월", "화", "수", "목", "금", "토", "일"];

/**
 * #운영시간# — 센터설정의 운영 시간(JSON)을 한 줄 문구로.
 * 저장 형식은 센터설정 화면과 동일: [{ days:[0..6], open:"HH:MM", close:"HH:MM", note:"" }]
 * 설정 화면의 표기 규칙(요일 ·로 연결, 00분이면 'N시')을 그대로 따른다.
 */
export async function loadCenterHours(centerId: number): Promise<string> {
  const { data } = await supabase
    .from("crm_centers")
    .select("operating_hours")
    .eq("id", centerId)
    .maybeSingle();
  const raw = (data as { operating_hours?: string | null } | null)?.operating_hours;
  if (!raw) return "";
  let list: { days?: number[]; open?: string; close?: string; note?: string }[];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return "";
    list = parsed;
  } catch {
    return raw; // 예전 자유 입력 값은 그대로
  }
  const hm = (t: string) => {
    const [h, m] = (t || "0:00").split(":");
    return m === "00" ? `${Number(h)}시` : `${Number(h)}시 ${Number(m)}분`;
  };
  return list
    .map((e) => {
      if (e.note) return e.note;
      const days = [...(e.days ?? [])].sort((a, b) => a - b).map((d) => HOURS_DAYS[d]).join("·");
      if (!days || !e.open || !e.close) return "";
      // 여는 시각과 닫는 시각이 같으면(예: 00:00~00:00) 설정이 안 된 것 —
      // 문구에 '0시~0시' 가 그대로 나가지 않도록 뺀다.
      if (e.open === e.close) return "";
      return `${days} ${hm(e.open)}~${hm(e.close)}`;
    })
    .filter(Boolean)
    .join(" · ");
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
