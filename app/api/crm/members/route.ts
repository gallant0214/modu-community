import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { loadPermissionsForContext } from "@/app/lib/crm-permissions";

export const dynamic = "force-dynamic";

const MEMBER_TYPES = ["provisional", "full", "matched"] as const;
const GENDERS = ["M", "F", "N"] as const;

// PostgREST 는 응답을 기본 1000행으로 제한하므로 range 로 나눠 모두 가져온다.
async function paginateAll<T>(
  buildQuery: () => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null }> },
  cap: number,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; from < cap; from += pageSize) {
    const to = Math.min(from + pageSize, cap) - 1;
    const { data } = await buildQuery().range(from, to);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize || all.length >= cap) break;
  }
  return all.slice(0, cap);
}

/**
 * GET /api/crm/members?q=&limit=
 *
 * 본인 센터의 회원 목록.
 * trainer/manager 는 본인이 담당(crm_passes.trainer_member_id)인 회원만.
 * owner/admin 은 센터 전체.
 *
 * [[feedback-crm-data-isolation]] 적용.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 5000);

  // ── 회원 스코프 계산 ──
  // 개인 CRM(solo) 로그인 시엔 "내가 다른 센터에서 담당(주강사·추가강사·판매자)하는 회원"도
  // 한 목록에 합쳐 보여준다. 단 다른 센터 회원은 조회 전용(foreign=true) —
  // 수정·삭제·발급은 그 센터 컨텍스트에서만, 개인 계정으로 등록한 회원만 이 CRM에서 관리. [[feedback-crm-data-isolation]]
  type CenterScope = { centerId: number; centerName: string; foreign: boolean; allowedIds: number[] | null };

  const teachingScopeIds = async (centerId: number, myMemberId: number): Promise<number[]> => {
    // 주강사(trainer_member_id) · 추가강사(co_trainer_ids) · 판매자(seller_member_id) 로 연결된 회원
    const { data: passes } = await supabase
      .from("crm_passes")
      .select("member_id")
      .eq("center_id", centerId)
      .or(
        `trainer_member_id.eq.${myMemberId},co_trainer_ids.cs.{${myMemberId}},seller_member_id.eq.${myMemberId}`
      );
    return Array.from(new Set((passes ?? []).map((p) => p.member_id)));
  };

  const scopes: CenterScope[] = [];
  {
    // 현재 컨텍스트 센터. solo owner/owner/admin = 전체, trainer/manager = 담당만.
    const restricted = (ctx.role === "trainer" || ctx.role === "manager") && !ctx.isSoloOwner;
    const allowedIds = restricted ? await teachingScopeIds(ctx.centerId, ctx.centerMemberId) : null;
    scopes.push({ centerId: ctx.centerId, centerName: ctx.centerName, foreign: false, allowedIds });
  }
  if (ctx.centerKind === "solo") {
    // 개인 CRM: 내가 소속된 다른 센터에서 담당하는 회원 합산 (조회 전용)
    const { data: others } = await supabase
      .from("crm_center_members")
      .select("id, center_id, role, is_solo_owner, crm_centers!inner(name)")
      .eq("firebase_uid", ctx.uid)
      .eq("status", "active")
      .neq("center_id", ctx.centerId);
    for (const om of others ?? []) {
      const centerObj = Array.isArray(om.crm_centers) ? om.crm_centers[0] : om.crm_centers;
      const centerName = (centerObj as { name?: string } | null)?.name ?? "";
      const restricted = (om.role === "trainer" || om.role === "manager") && !om.is_solo_owner;
      const allowedIds = restricted ? await teachingScopeIds(om.center_id, om.id) : null;
      scopes.push({ centerId: om.center_id, centerName, foreign: true, allowedIds });
    }
  }

  const centerIds = Array.from(new Set(scopes.map((s) => s.centerId)));
  const centerNameById = new Map(scopes.map((s) => [s.centerId, s.centerName] as const));
  const foreignCenterIds = new Set(scopes.filter((s) => s.foreign).map((s) => s.centerId));

  type MemberBase = {
    id: number;
    member_type: string;
    name: string;
    phone: string;
    email: string | null;
    birth: string | null;
    gender: string | null;
    linked_firebase_uid: string | null;
    memo: string | null;
    status: string;
    address: string | null;
    visit_route: string | null;
    workout_goal: string | null;
    counselor: string | null;
    mileage: number;
    marketing_consent: boolean;
    registered_at: string | null;
    registration_type: string | null;
    first_use_at: string | null;
    total_paid_won: number;
    final_expire_at: string | null;
    last_purchase_at: string | null;
    last_attended_at: string | null;
    attendance_no: string | null;
    current_membership: string | null;
    current_pass: string | null;
    current_rental: string | null;
    current_locker: string | null;
    created_at: string;
    center_id: number;
  };

  // 목록 성능: 얼굴썸네일(base64, 회원당 ~12KB)은 벌크에서 제외한다.
  // 리스트에 보이는 페이지(≤50명) 것만 /api/crm/members/thumbs 로 지연 로드.
  const MEMBER_SELECT =
    "id, member_type, name, phone, email, birth, gender, linked_firebase_uid, memo, status, address, visit_route, workout_goal, counselor, mileage, marketing_consent, registered_at, registration_type, first_use_at, total_paid_won, final_expire_at, last_purchase_at, last_attended_at, attendance_no, current_membership, current_pass, current_rental, current_locker, created_at, center_id";

  const fetchScope = (s: CenterScope) =>
    paginateAll<MemberBase>(
      () => {
        let query = supabase
          .from("crm_members")
          .select(MEMBER_SELECT)
          .eq("center_id", s.centerId)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .order("id", { ascending: false }); // 동일 created_at 다수 → range 페이지네이션 안정화
        if (s.allowedIds) query = query.in("id", s.allowedIds.length ? s.allowedIds : [-1]);
        if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
        return query as unknown as {
          range: (from: number, to: number) => PromiseLike<{ data: MemberBase[] | null }>;
        };
      },
      limit
    );

  let baseMembers: MemberBase[];
  try {
    if (scopes.length === 1) {
      baseMembers = await fetchScope(scopes[0]);
    } else {
      const perScope = await Promise.all(scopes.map(fetchScope));
      baseMembers = perScope.flat().slice(0, limit);
    }
  } catch (e) {
    return NextResponse.json(
      { error: "조회 실패", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }

  // 각 회원에 center_name / foreign(조회 전용) 태깅
  const members = baseMembers.map((m) => ({
    ...m,
    center_name: centerNameById.get(m.center_id) ?? "",
    foreign: foreignCenterIds.has(m.center_id),
  }));

  const wantDetail = url.searchParams.get("detail") === "1";
  if (!wantDetail || members.length === 0) {
    return NextResponse.json({ members });
  }

  const ids = members.map((m) => m.id);

  // 회원 수가 많으면(예: 수천 명) .in() 에 전체 id 를 넣으면 URL 길이 초과가 날 수 있어
  // 500개 단위로 쪼개서 조회 후 합친다.
  const CHUNK = 500;
  const idChunks: number[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) idChunks.push(ids.slice(i, i + CHUNK));

  const gather = async <T>(
    run: (chunk: number[]) => PromiseLike<{ data: unknown[] | null }>
  ): Promise<T[]> => {
    const results = await Promise.all(idChunks.map((c) => run(c)));
    return results.flatMap((r) => (r.data ?? []) as T[]);
  };

  // 활성 수강권 + 활성 회원권 + 락커 배정 + 최근 출석
  const [passesData, mbData, lockersData, attData] = await Promise.all([
    gather<{
      member_id: number;
      lesson_kind: string;
      remaining_sessions: number | null;
      total_sessions: number;
      expires_at: string;
      start_date: string | null;
      is_paused: boolean;
      outstanding_won: number | null;
      payment_status: string | null;
    }>(
      (c) =>
        supabase
          .from("crm_passes")
          .select("member_id, lesson_kind, remaining_sessions, total_sessions, expires_at, start_date, is_paused, outstanding_won, payment_status")
          .in("center_id", centerIds)
          .in("member_id", c)
          .eq("status", "valid")
    ),
    gather<{
      member_id: number;
      plan_name: string;
      expires_at: string;
      start_date: string | null;
      is_paused: boolean;
      outstanding_won: number | null;
      payment_status: string | null;
    }>((c) =>
      supabase
        .from("crm_memberships")
        .select("member_id, plan_name, expires_at, start_date, is_paused, outstanding_won, payment_status")
        .in("center_id", centerIds)
        .in("member_id", c)
        .eq("status", "valid")
    ),
    gather<{ assigned_member_id: number | null; number: number; zone_id: number; crm_locker_zones: { name?: string } | { name?: string }[] | null }>(
      (c) =>
        supabase
          .from("crm_lockers")
          .select("assigned_member_id, number, zone_id, crm_locker_zones(name)")
          .in("center_id", centerIds)
          .in("assigned_member_id", c)
    ),
    gather<{ member_id: number; checked_in_at: string }>((c) =>
      supabase
        .from("crm_attendances")
        .select("member_id, checked_in_at")
        .in("center_id", centerIds)
        .in("member_id", c)
        .order("checked_in_at", { ascending: false })
        .limit(2000)
    ),
  ]);

  // KST 오늘 (예정 판정용)
  const todayKstYmd = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const holdSet = new Set<number>(); // 유효 이용권 중 홀딩(정지)중인 회원
  const hasActiveSet = new Set<number>(); // 지금 이용중(시작함 & 만료 전)인 이용권 보유 회원
  const hasFutureSet = new Set<number>(); // 시작일이 미래인(아직 시작 안 함) 이용권 보유 회원

  // 유효 이용권 1건을 사람별 활성/미래/홀딩 집합에 반영
  const classify = (memberId: number, startDate: string | null, expires: string, paused: boolean) => {
    if (paused) holdSet.add(memberId);
    if (startDate && startDate > todayKstYmd) {
      hasFutureSet.add(memberId); // 아직 시작 안 함
    } else if (!expires || expires >= todayKstYmd) {
      hasActiveSet.add(memberId); // 시작됨(또는 시작일 없음) & 만료 전 → 현재 이용중
    }
  };

  const passMap = new Map<number, { kind: string; type: "lesson" | "membership"; remaining: number | null; expires: string }[]>();
  const outstandingMap = new Map<number, number>();
  const feedOutstanding = (memberId: number, amount: number | null, paymentStatus: string | null) => {
    const won = Math.max(0, Number(amount) || 0);
    if (won <= 0 && paymentStatus !== "unpaid" && paymentStatus !== "partial") return;
    outstandingMap.set(memberId, (outstandingMap.get(memberId) ?? 0) + won);
  };
  for (const p of passesData) {
    // 횟수제 수강권이 모두 소진(출석완료)됐으면 '이용 가능 상품'에서 제외.
    // (기간제(total_sessions<=0)는 잔여 개념이 없어 그대로 표시)
    const isCount = (p.total_sessions ?? 0) > 0;
    const usedUp = isCount && (p.remaining_sessions ?? 0) <= 0;
    // 이용기간이 지난(만료) 상품은 '이용 가능 상품'에서 제외
    const expired = !!p.expires_at && p.expires_at < todayKstYmd;
    if (!usedUp) {
      if (!expired) {
        const arr = passMap.get(p.member_id) ?? [];
        arr.push({
          kind: p.lesson_kind,
          type: "lesson",
          remaining: p.remaining_sessions ?? null,
          expires: p.expires_at,
        });
        passMap.set(p.member_id, arr);
      }
      classify(p.member_id, p.start_date, p.expires_at, p.is_paused);
    }
    feedOutstanding(p.member_id, p.outstanding_won, p.payment_status);
  }
  for (const m of mbData) {
    // 이용기간이 지난(만료) 회원권은 '이용 가능 상품'에서 제외
    const expired = !!m.expires_at && m.expires_at < todayKstYmd;
    if (!expired) {
      const arr = passMap.get(m.member_id) ?? [];
      arr.push({
        kind: m.plan_name,
        type: "membership",
        remaining: null,
        expires: m.expires_at,
      });
      passMap.set(m.member_id, arr);
    }
    classify(m.member_id, m.start_date, m.expires_at, m.is_paused);
    feedOutstanding(m.member_id, m.outstanding_won, m.payment_status);
  }

  const lockerMap = new Map<number, string>();
  for (const l of lockersData) {
    if (l.assigned_member_id) {
      const zone = l.crm_locker_zones;
      const zoneName = Array.isArray(zone) ? zone[0]?.name : zone?.name;
      lockerMap.set(l.assigned_member_id, `${zoneName ?? "락커"} ${l.number}번`);
    }
  }

  // 청크 간 순서가 보장되지 않으므로 회원별 최대(최근) 값으로 계산
  const lastVisitMap = new Map<number, string>();
  for (const a of attData) {
    const prev = lastVisitMap.get(a.member_id);
    if (!prev || a.checked_in_at > prev) lastVisitMap.set(a.member_id, a.checked_in_at);
  }

  // 최근 구매일 = 결제(crm_payments) 최신 paid_at(KST 날짜). 발급 시 자동 갱신이 없던
  // last_purchase_at 컬럼 대신 실제 결제 기록으로 계산(없으면 기존 컬럼값 유지).
  const paymentsData = await gather<{ member_id: number; paid_at: string; amount_won: number; status: string }>((c) =>
    supabase
      .from("crm_payments")
      .select("member_id, paid_at, amount_won, status")
      .in("center_id", centerIds)
      .in("member_id", c)
  );
  const lastPurchaseMap = new Map<number, string>();
  for (const p of paymentsData) {
    if (!p.member_id || !p.paid_at) continue;
    const ymd = new Date(new Date(p.paid_at).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const prev = lastPurchaseMap.get(p.member_id);
    if (!prev || ymd > prev) lastPurchaseMap.set(p.member_id, ymd);
  }

  // 누적 결제 = crm_sales 원장(BROJ 임포트) + 원장 컷오프 이후 crm_payments.
  //   total_paid_won 스냅샷 컬럼이 대부분 0(미갱신)이라, center-revenue 와 동일한
  //   either/or 규칙으로 실제 결제 기록에서 계산해 표시(이중집계 방지).
  //   컷오프 = crm_sales 마지막 거래일(KST). 원장 없으면 crm_payments 전체 합산.
  const { data: maxTxRow } = await supabase
    .from("crm_sales")
    .select("tx_at")
    .in("center_id", centerIds)
    .order("tx_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const salesCutoffYmd = (maxTxRow as { tx_at?: string } | null)?.tx_at
    ? new Date(new Date((maxTxRow as { tx_at: string }).tx_at).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
    : null;
  // crm_sales 회원별 순액(판매/미수금결제 +, 환불 −)
  const salesData = await gather<{ member_id: number; amount_won: number; tx_type: string }>((c) =>
    supabase.from("crm_sales").select("member_id, amount_won, tx_type").in("center_id", centerIds).in("member_id", c)
  );
  const salesNetMap = new Map<number, number>();
  for (const s of salesData) {
    if (!s.member_id) continue;
    const signed = s.tx_type === "환불" ? -(s.amount_won ?? 0) : s.amount_won ?? 0;
    salesNetMap.set(s.member_id, (salesNetMap.get(s.member_id) ?? 0) + signed);
  }
  // crm_payments 중 컷오프 이후(원장 없으면 전체) 완료 결제 합
  const paidAfterCutoffMap = new Map<number, number>();
  for (const p of paymentsData) {
    if (!p.member_id || p.status !== "completed") continue;
    if (salesCutoffYmd) {
      const ymd = p.paid_at ? new Date(new Date(p.paid_at).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10) : null;
      if (!ymd || ymd <= salesCutoffYmd) continue; // 컷오프 이전은 원장에 이미 포함
    }
    paidAfterCutoffMap.set(p.member_id, (paidAfterCutoffMap.get(p.member_id) ?? 0) + (p.amount_won ?? 0));
  }

  const enriched = members.map((m) => {
    const items = passMap.get(m.id) ?? [];
    const maxExpires = items.reduce<string | null>(
      (acc, x) => (!acc || x.expires > acc ? x.expires : acc),
      null
    );
    return {
      ...m,
      items,
      locker_label: lockerMap.get(m.id) ?? null,
      last_visit_at: lastVisitMap.get(m.id) ?? null,
      // 결제 기록 기반 최근 구매일(없으면 기존 컬럼값)
      last_purchase_at: lastPurchaseMap.get(m.id) ?? m.last_purchase_at,
      // 누적 결제: 원장 순액 + 컷오프 이후 결제(계산값). 계산이 0 이하이면 스냅샷 컬럼 폴백.
      total_paid_won: (() => {
        const computed = (salesNetMap.get(m.id) ?? 0) + (paidAfterCutoffMap.get(m.id) ?? 0);
        return computed > 0 ? computed : m.total_paid_won ?? 0;
      })(),
      max_expires_at: maxExpires,
      on_hold: holdSet.has(m.id),
      outstanding_won: outstandingMap.get(m.id) ?? 0,
      // 예정 = 미래 시작 이용권이 있고, 지금 이용중인 이용권은 없는 회원
      scheduled: hasFutureSet.has(m.id) && !hasActiveSet.has(m.id),
    };
  });

  return NextResponse.json({ members: enriched });
}

/**
 * POST /api/crm/members
 *
 * 회원 등록 (3종):
 *   - provisional (가회원): name + phone 만, linked_firebase_uid 없이
 *   - full (정회원): 가입대행 — 별도 인증 시스템이 필요. 1차 v1 에선 provisional 과 동일하게 처리하되 type 만 다름
 *   - matched (매칭회원): linked_firebase_uid 필수 (기존 moducm 사용자)
 *
 * owner/admin 만 진입 (trainer/manager 는 본인 회원 등록 불가).
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  // owner/admin/1인 강사 기본 허용 + 직급권한 members.create 부여받은 직급(예: FC·팀장)도 허용.
  // (FC 역할의 핵심 = 회원 등록/판매 — 직급권한 토글이 실제로 동작하도록)
  const isAdminRole = ctx.role === "owner" || ctx.role === "admin";
  if (!isAdminRole && !ctx.isSoloOwner) {
    const perms = await loadPermissionsForContext(ctx);
    if (perms["members.create"] !== true) {
      return NextResponse.json({ error: "회원 등록 권한이 없습니다" }, { status: 403 });
    }
  }

  let body: {
    member_type?: string;
    name?: string;
    phone?: string;
    email?: string;
    birth?: string;
    gender?: string;
    linked_firebase_uid?: string;
    memo?: string;
    address?: string;
    visit_route?: string;
    workout_goal?: string;
    counselor?: string;
    mileage?: number | string;
    marketing_consent?: boolean;
    registered_at?: string;
    registration_type?: string;
    first_use_at?: string;
    total_paid_won?: number | string;
    final_expire_at?: string;
    last_purchase_at?: string;
    last_attended_at?: string;
    attendance_no?: string;
    current_membership?: string;
    current_pass?: string;
    current_rental?: string;
    current_locker?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const memberType = body.member_type;
  if (!memberType || !MEMBER_TYPES.includes(memberType as (typeof MEMBER_TYPES)[number])) {
    return NextResponse.json({ error: "회원 유형이 잘못됨" }, { status: 400 });
  }
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "이름을 입력해주세요" }, { status: 400 });
  const phone = body.phone?.trim() || null;
  const email = body.email?.trim() || null;
  const linkedUid = body.linked_firebase_uid?.trim() || null;
  // 정책:
  //  - provisional (커뮤니티 미가입 회원): phone 필수 — 안내 채널 확보
  //  - matched/full (모두의 지도사 커뮤니티 회원 매칭): linked_firebase_uid 로 식별되므로 phone·email 없이 등록 허용
  if (memberType === "provisional") {
    if (!phone) {
      return NextResponse.json({ error: "연락처를 입력해주세요" }, { status: 400 });
    }
  }

  if ((memberType === "matched" || memberType === "full") && !linkedUid) {
    return NextResponse.json({ error: "정회원/매칭회원은 사용자 식별자가 필요합니다" }, { status: 400 });
  }

  const insert = {
    center_id: ctx.centerId,
    member_type: memberType,
    name,
    phone,
    email,
    birth: body.birth || null,
    gender:
      body.gender && GENDERS.includes(body.gender as (typeof GENDERS)[number])
        ? body.gender
        : null,
    linked_firebase_uid: linkedUid,
    memo: body.memo?.trim() || null,
    address: body.address?.trim() || null,
    visit_route: body.visit_route?.trim() || null,
    workout_goal: body.workout_goal?.trim() || null,
    counselor: body.counselor?.trim() || null,
    mileage: (() => {
      const n = Math.trunc(Number(body.mileage ?? 0));
      return Number.isFinite(n) && n >= 0 ? n : 0;
    })(),
    marketing_consent: !!body.marketing_consent,
    registered_at: body.registered_at || null,
    registration_type: body.registration_type?.trim() || null,
    first_use_at: body.first_use_at || null,
    total_paid_won: (() => {
      const n = Math.trunc(Number(body.total_paid_won ?? 0));
      return Number.isFinite(n) && n >= 0 ? n : 0;
    })(),
    final_expire_at: body.final_expire_at || null,
    last_purchase_at: body.last_purchase_at || null,
    last_attended_at: body.last_attended_at || null,
    // 출석번호는 등록 완료 시 휴대폰 뒷 4자리로 자동 설정.
    // (명시값이 오면 존중 — 예: 가져오기. 없으면 폰 뒷자리, 폰도 없으면 null)
    attendance_no:
      body.attendance_no?.trim() ||
      (phone ? phone.replace(/\D/g, "").slice(-4) || null : null),
    current_membership: body.current_membership?.trim() || null,
    current_pass: body.current_pass?.trim() || null,
    current_rental: body.current_rental?.trim() || null,
    current_locker: body.current_locker?.trim() || null,
    status: "active" as const,
  };

  const { data, error } = await supabase
    .from("crm_members")
    .insert(insert)
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "등록 실패", detail: error?.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "member.create",
    entity_type: "member",
    entity_id: data.id,
    payload: { member_type: memberType, name } as never,
  });

  return NextResponse.json({ ok: true, memberId: data.id });
}
