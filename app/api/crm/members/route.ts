import { errDetail } from "@/app/lib/api-error";
import { NextResponse, after } from "next/server";
import { escapePostgrestQuery } from "@/app/lib/security";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { loadPermissionsForContext, requirePermission } from "@/app/lib/crm-permissions";
import { notifyCenterStaffSignupPurchase } from "@/app/lib/crm-staff-notify";
import { enrichMemberListDetail } from "@/app/lib/crm-member-list-detail";

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
  // 🚨 .or() 필터 문자열에 그대로 들어간다 — 쉼표·괄호를 지우지 않으면 조건을 끼워 넣을 수 있다
  const q = escapePostgrestQuery(url.searchParams.get("q") || "");
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

  // '센터 전체 회원 보기'(members.app_view_all) 권한이 있으면 trainer/manager 도 전체 조회.
  // 직급 권한에서 이 항목을 켜면 담당 회원만 → 센터 전체로 확장된다. [[feedback-crm-data-isolation]]
  const ctxPerms = await loadPermissionsForContext(ctx);
  const ctxCanViewAll = ctxPerms["members.app_view_all"] === true;

  const scopes: CenterScope[] = [];
  {
    // 현재 컨텍스트 센터. '센터 전체 회원 보기' 권한(대표자·개인원장은 항상)이면 전체, 아니면 담당만.
    const restricted = !ctxCanViewAll;
    const allowedIds = restricted ? await teachingScopeIds(ctx.centerId, ctx.centerMemberId) : null;
    scopes.push({ centerId: ctx.centerId, centerName: ctx.centerName, foreign: false, allowedIds });
  }
  if (ctx.centerKind === "solo") {
    // 개인 CRM: 내가 소속된 다른 센터에서 담당하는 회원 합산 (조회 전용)
    const { data: others } = await supabase
      .from("crm_center_members")
      .select("id, center_id, role, grade_id, is_solo_owner, crm_centers!inner(name)")
      .eq("firebase_uid", ctx.uid)
      .eq("status", "active")
      .neq("center_id", ctx.centerId);
    for (const om of others ?? []) {
      const centerObj = Array.isArray(om.crm_centers) ? om.crm_centers[0] : om.crm_centers;
      const centerName = (centerObj as { name?: string } | null)?.name ?? "";
      // 그 센터의 직급권한(센터 전체 회원 보기)을 그대로 따른다
      const omPerms = await loadPermissionsForContext({
        ...ctx,
        centerId: om.center_id,
        centerMemberId: om.id,
        role: om.role as typeof ctx.role,
        gradeId: (om as { grade_id?: number | null }).grade_id ?? null,
        isSoloOwner: !!om.is_solo_owner,
      });
      const restricted = omPerms["members.app_view_all"] !== true;
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
    first_registered_at: string | null;
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
    "id, member_type, name, phone, email, birth, gender, linked_firebase_uid, memo, status, address, visit_route, workout_goal, counselor, mileage, marketing_consent, registered_at, first_registered_at, registration_type, first_use_at, total_paid_won, final_expire_at, last_purchase_at, last_attended_at, attendance_no, current_membership, current_pass, current_rental, current_locker, created_at, center_id";

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
      { error: "조회 실패", detail: errDetail(e) },
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

  const enriched = await enrichMemberListDetail(members, { centerIds, holdCenterId: ctx.centerId });

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
  const createDenied = await requirePermission(ctx, "members.create");
  if (createDenied) return createDenied;

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
    // 신규 회원 기본값 = '신규' (미지정 시 목록에 신규/재등록 칩이 안 떠서 기본값 부여)
    registration_type: body.registration_type?.trim() || "신규",
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
    return NextResponse.json({ error: "등록 실패", detail: errDetail(error) }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "member.create",
    entity_type: "member",
    entity_id: data.id,
    payload: { member_type: memberType, name } as never,
  });

  // 가입 및 등록 알림 — 권한 있는 직원에게 신규가입 알림
  after(() =>
    notifyCenterStaffSignupPurchase({ centerId: ctx.centerId, kind: "signup", memberId: data.id, memberName: name })
  );

  return NextResponse.json({ ok: true, memberId: data.id });
}
