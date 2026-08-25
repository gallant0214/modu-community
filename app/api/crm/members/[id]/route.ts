import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { loadPermissionsForContext } from "@/app/lib/crm-permissions";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/members/[id]
 * 회원 상세 + 본인 수강권 목록.
 *
 * trainer/manager 는 본인이 담당인 수강권이 1개 이상 있어야 접근 가능.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const memberId = Number(id);
  if (!memberId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  // 개인 CRM(solo)에서 "다른 센터에서 담당하는 회원"을 조회 전용으로 열람하는 경우 ?center=<id>.
  // 그 센터의 활성 멤버십이 있어야 하고, 응답은 read_only=true 로 표시(편집 UI 차단).
  const targetCenterParam = Number(new URL(request.url).searchParams.get("center") || 0);
  let targetCenterId = ctx.centerId;
  let scopeMemberId = ctx.centerMemberId;
  let readOnly = false;
  if (targetCenterParam && targetCenterParam !== ctx.centerId && ctx.centerKind === "solo") {
    const { data: otherMembership } = await supabase
      .from("crm_center_members")
      .select("id")
      .eq("firebase_uid", ctx.uid)
      .eq("center_id", targetCenterParam)
      .eq("status", "active")
      .maybeSingle();
    if (otherMembership) {
      targetCenterId = targetCenterParam;
      scopeMemberId = otherMembership.id;
      readOnly = true;
    }
  }

  const { data: member, error } = await supabase
    .from("crm_members")
    .select(
      "id, member_type, name, phone, email, birth, gender, linked_firebase_uid, memo, status, address, visit_route, workout_goal, counselor, mileage, marketing_consent, registered_at, registration_type, first_use_at, total_paid_won, final_expire_at, last_purchase_at, last_attended_at, attendance_no, current_membership, current_pass, current_rental, current_locker, face_image_data, face_image_thumb, created_at"
    )
    .eq("id", memberId)
    .eq("center_id", targetCenterId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  if (!member) {
    return NextResponse.json({ error: "회원을 찾을 수 없습니다" }, { status: 404 });
  }

  let passQuery = supabase
    .from("crm_passes")
    .select(
      "id, issue_type, lesson_kind, total_sessions, remaining_sessions, session_minutes, price_won, vat_included, payment_method, payment_method_custom, issued_at, expires_at, status, memo, trainer_member_id, seller_member_id, created_at"
    )
    .eq("center_id", targetCenterId)
    .eq("member_id", memberId)
    .neq("status", "deleted")
    .order("issued_at", { ascending: false });

  // 1인 강사(solo owner)는 본인 센터 전체 접근 → 격리 미적용.
  // 다른 센터 조회(readOnly)일 땐 그 센터에서 내가 담당한 수강권만.
  const restricted =
    readOnly || ((ctx.role === "trainer" || ctx.role === "manager") && !ctx.isSoloOwner);
  if (restricted) {
    // 주강사 또는 추가강사(co_trainer_ids)로 배정된 수강권만
    passQuery = passQuery.or(
      `trainer_member_id.eq.${scopeMemberId},co_trainer_ids.cs.{${scopeMemberId}}`
    );
  }

  const { data: passes } = await passQuery;

  // trainer/manager 는 본인 담당 회원이 아닐 때 차단
  if (restricted && (passes ?? []).length === 0) {
    return NextResponse.json({ error: "이 회원에 대한 접근 권한이 없습니다" }, { status: 403 });
  }

  // 수강권별 "이미 잡힌 예약 수"(취소·거절 제외) → 예약 가능 슬롯 계산용.
  // 예약은 잔여횟수를 즉시 줄이지 않으므로, 총 횟수 - reserved_count 로 남은 예약 가능 수를 판단.
  const passIds = (passes ?? []).map((p) => p.id);
  const reservedMap = new Map<number, number>();
  if (passIds.length > 0) {
    const { data: resv } = await supabase
      .from("crm_reservations")
      .select("pass_id")
      .eq("center_id", targetCenterId)
      .in("pass_id", passIds)
      .not("status", "in", "(cancelled,rejected)");
    for (const r of resv ?? []) {
      if (r.pass_id != null) reservedMap.set(r.pass_id, (reservedMap.get(r.pass_id) ?? 0) + 1);
    }
  }
  const passesOut = (passes ?? []).map((p) => ({
    ...p,
    reserved_count: reservedMap.get(p.id) ?? 0,
  }));

  // 최근 구매일·최종 만료일은 발급 시 stored 컬럼이 자동 갱신되지 않으므로 실시간 계산해 덮어씀.
  const isUnlimited = (d?: string | null) =>
    !!d && (d.startsWith("9999") || d.startsWith("2999"));

  // 최근 구매일 · 누적 결제금액 = crm_payments 실측 (컬럼값은 자동 갱신되지 않아 신뢰 X)
  const { data: pays } = await supabase
    .from("crm_payments")
    .select("paid_at, amount_won, status")
    .eq("center_id", targetCenterId)
    .eq("member_id", memberId);
  let lastPaidRaw: string | null = null;
  let totalPaid = 0;
  for (const p of (pays ?? []) as { paid_at: string | null; amount_won: number | null; status: string | null }[]) {
    if (p.status === "cancelled") continue; // 환불/취소는 합계에서 제외
    if (typeof p.amount_won === "number") totalPaid += p.amount_won;
    if (p.paid_at && (!lastPaidRaw || p.paid_at > lastPaidRaw)) lastPaidRaw = p.paid_at;
  }
  const lastPaid = lastPaidRaw
    ? new Date(new Date(lastPaidRaw).getTime() + 9 * 3600 * 1000)
        .toISOString()
        .slice(0, 10)
    : null;

  // 최종 만료일 계산 규칙:
  // - 회원권·대여권·락커: 유효 건의 expires_at (무기한 sentinel 이면 무기한)
  // - 수강권: 무기한(count제)이고 잔여>0 → '무기한'(진행 중).
  //           무기한이지만 잔여 0(수업 종료) → 종료 시점(마지막 출석일, 없으면 갱신일)으로 만료 처리.
  //           기간제 → expires_at.
  const kstYmd = (iso: string) =>
    new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);

  const [msE, psE, rsE, lkE] = await Promise.all([
    supabase.from("crm_memberships").select("expires_at").eq("center_id", targetCenterId).eq("member_id", memberId).eq("status", "valid"),
    supabase.from("crm_passes").select("id, expires_at, remaining_sessions, updated_at").eq("center_id", targetCenterId).eq("member_id", memberId).eq("status", "valid"),
    supabase.from("crm_rentals").select("expires_at").eq("center_id", targetCenterId).eq("member_id", memberId).in("status", ["valid", "active"]),
    supabase.from("crm_lockers").select("expires_at").eq("center_id", targetCenterId).eq("assigned_member_id", memberId).eq("state", "assigned"),
  ]);

  let hasActiveUnlimited = false;
  const expCandidates: string[] = [];

  // 회원권·대여권·락커 (기간형)
  for (const x of [...(msE.data ?? []), ...(rsE.data ?? []), ...(lkE.data ?? [])]) {
    const exp = (x as { expires_at: string | null }).expires_at;
    if (!exp) continue;
    if (isUnlimited(exp)) hasActiveUnlimited = true;
    else expCandidates.push(exp.slice(0, 10));
  }

  // 수강권
  const usedUpUnlimited: { id: number; updated_at: string | null }[] = [];
  for (const p of (psE.data ?? []) as { id: number; expires_at: string | null; remaining_sessions: number | null; updated_at: string | null }[]) {
    if (isUnlimited(p.expires_at)) {
      if ((p.remaining_sessions ?? 0) > 0) hasActiveUnlimited = true; // 진행 중 → 무기한
      else usedUpUnlimited.push({ id: p.id, updated_at: p.updated_at }); // 종료 → 종료 시점 필요
    } else if (p.expires_at) {
      expCandidates.push(p.expires_at.slice(0, 10));
    }
  }

  // 종료된 무기한 수강권: 마지막 출석일(없으면 갱신일)을 만료 시점으로.
  if (usedUpUnlimited.length) {
    const ids = usedUpUnlimited.map((p) => p.id);
    const { data: att } = await supabase
      .from("crm_reservations")
      .select("pass_id, attended_at, starts_at")
      .eq("center_id", targetCenterId)
      .in("pass_id", ids)
      .eq("status", "attended");
    const lastAttByPass = new Map<number, string>();
    for (const r of (att ?? []) as { pass_id: number | null; attended_at: string | null; starts_at: string | null }[]) {
      if (!r.pass_id) continue;
      const d = r.attended_at ?? r.starts_at;
      if (!d) continue;
      const ymd = kstYmd(d);
      const prev = lastAttByPass.get(r.pass_id);
      if (!prev || ymd > prev) lastAttByPass.set(r.pass_id, ymd);
    }
    for (const p of usedUpUnlimited) {
      const end = lastAttByPass.get(p.id) ?? (p.updated_at ? kstYmd(p.updated_at) : null);
      if (end) expCandidates.push(end);
    }
  }

  let finalExp: string | null = null;
  if (hasActiveUnlimited) finalExp = "9999-12-31";
  else if (expCandidates.length) finalExp = expCandidates.reduce((a, b) => (a > b ? a : b));

  const memberOut = {
    ...member,
    // 결제 실측 우선(자동 갱신되지 않는 stored 값 대체). 결제 이력 없을 때만 stored 유지.
    total_paid_won: (pays && pays.length > 0) ? totalPaid : (member.total_paid_won ?? 0),
    last_purchase_at: lastPaid ?? member.last_purchase_at,
    final_expire_at: finalExp ?? member.final_expire_at,
  };

  return NextResponse.json({ member: memberOut, passes: passesOut, read_only: readOnly });
}

// 회원 필드 그룹 — 권한 매트릭스와 매핑
const BASIC_FIELDS = new Set([
  "name",
  "phone",
  "email",
  "birth",
  "gender",
  "member_type",
  "memo",
]);
const USAGE_FIELDS = new Set([
  "address",
  "visit_route",
  "workout_goal",
  "counselor",
  "mileage",
  "marketing_consent",
  "registered_at",
  "registration_type",
  "first_use_at",
  "final_expire_at",
  "last_purchase_at",
  "last_attended_at",
  "total_paid_won",
  "attendance_no",
  "current_membership",
  "current_pass",
  "current_rental",
  "current_locker",
  "face_image_data",
  "face_image_thumb",
  "face_descriptor",
]);

// 얼굴 사진 base64 최대 크기 (안전장치 · 300KB)
const FACE_MAX_BASE64_LEN = 400_000;

/**
 * PATCH /api/crm/members/[id]
 * 회원 정보 수정.
 * 권한: 필드가 기본정보(BASIC_FIELDS) 면 members.edit_basic,
 *       이용정보(USAGE_FIELDS) 면 members.edit_usage 가 있어야 함.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const perms = await loadPermissionsForContext(ctx);

  const { id } = await params;
  const memberId = Number(id);
  if (!memberId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  let body: {
    name?: string;
    phone?: string;
    email?: string;
    birth?: string;
    gender?: string;
    member_type?: string;
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
    face_image_data?: string | null;
    face_image_thumb?: string | null;
    face_descriptor?: number[] | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const v = body.name.trim();
    if (!v) return NextResponse.json({ error: "이름을 입력해주세요" }, { status: 400 });
    patch.name = v;
  }
  if (body.phone !== undefined) {
    const v = body.phone.trim();
    if (!v) return NextResponse.json({ error: "연락처를 입력해주세요" }, { status: 400 });
    patch.phone = v;
  }
  if (body.email !== undefined) patch.email = body.email.trim() || null;
  if (body.birth !== undefined) patch.birth = body.birth || null;
  if (body.gender !== undefined) {
    if (body.gender && !["M", "F", "N"].includes(body.gender)) {
      return NextResponse.json({ error: "성별 값이 잘못됨" }, { status: 400 });
    }
    patch.gender = body.gender || null;
  }
  if (body.member_type !== undefined) {
    if (!["provisional", "full", "matched"].includes(body.member_type)) {
      return NextResponse.json({ error: "회원 유형 값이 잘못됨" }, { status: 400 });
    }
    patch.member_type = body.member_type;
  }
  if (body.memo !== undefined) patch.memo = body.memo.trim() || null;
  if (body.address !== undefined) patch.address = body.address.trim() || null;
  if (body.visit_route !== undefined) patch.visit_route = body.visit_route.trim() || null;
  if (body.workout_goal !== undefined) patch.workout_goal = body.workout_goal.trim() || null;
  if (body.counselor !== undefined) patch.counselor = body.counselor.trim() || null;
  if (body.mileage !== undefined) {
    const n = Math.trunc(Number(body.mileage));
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: "마일리지 값이 잘못됨" }, { status: 400 });
    }
    patch.mileage = n;
  }
  if (body.marketing_consent !== undefined) patch.marketing_consent = !!body.marketing_consent;
  if (body.registered_at !== undefined) patch.registered_at = body.registered_at || null;
  if (body.registration_type !== undefined) patch.registration_type = body.registration_type.trim() || null;
  if (body.first_use_at !== undefined) patch.first_use_at = body.first_use_at || null;
  if (body.total_paid_won !== undefined) {
    const n = Math.trunc(Number(body.total_paid_won));
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: "누적 결제 금액 값이 잘못됨" }, { status: 400 });
    }
    patch.total_paid_won = n;
  }
  if (body.final_expire_at !== undefined) patch.final_expire_at = body.final_expire_at || null;
  if (body.last_purchase_at !== undefined) patch.last_purchase_at = body.last_purchase_at || null;
  if (body.last_attended_at !== undefined) patch.last_attended_at = body.last_attended_at || null;
  if (body.attendance_no !== undefined) patch.attendance_no = body.attendance_no.trim() || null;
  if (body.current_membership !== undefined) patch.current_membership = body.current_membership.trim() || null;
  if (body.current_pass !== undefined) patch.current_pass = body.current_pass.trim() || null;
  if (body.current_rental !== undefined) patch.current_rental = body.current_rental.trim() || null;
  if (body.current_locker !== undefined) patch.current_locker = body.current_locker.trim() || null;
  if (body.face_image_data !== undefined) {
    const v = body.face_image_data;
    if (v === null || v === "") {
      patch.face_image_data = null;
    } else if (typeof v === "string" && v.startsWith("data:image/") && v.length <= FACE_MAX_BASE64_LEN) {
      patch.face_image_data = v;
    } else {
      return NextResponse.json(
        { error: "얼굴 이미지가 너무 크거나 형식이 잘못됐어요" },
        { status: 400 }
      );
    }
  }
  if (body.face_image_thumb !== undefined) {
    const v = body.face_image_thumb;
    if (v === null || v === "") {
      patch.face_image_thumb = null;
    } else if (typeof v === "string" && v.startsWith("data:image/") && v.length <= 40_000) {
      patch.face_image_thumb = v;
    } else {
      return NextResponse.json(
        { error: "썸네일 이미지가 너무 크거나 형식이 잘못됐어요" },
        { status: 400 }
      );
    }
  }
  // 얼굴 인식용 디스크립터 (128차원 float 배열). 얼굴 미검출 시 null.
  if (body.face_descriptor !== undefined) {
    const v = body.face_descriptor;
    if (v === null) {
      patch.face_descriptor = null;
    } else if (Array.isArray(v) && v.length >= 64 && v.length <= 512 && v.every((n) => typeof n === "number" && Number.isFinite(n))) {
      patch.face_descriptor = v;
    } else {
      return NextResponse.json({ error: "얼굴 인식 데이터 형식이 잘못됐어요" }, { status: 400 });
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "변경할 항목이 없습니다" }, { status: 400 });
  }

  // 필드 그룹별 권한 검사
  const touchedBasic = Object.keys(patch).some((k) => BASIC_FIELDS.has(k));
  const touchedUsage = Object.keys(patch).some((k) => USAGE_FIELDS.has(k));
  if (touchedBasic && !perms["members.edit_basic"]) {
    return NextResponse.json(
      { error: "회원 기본정보 수정 권한이 없습니다" },
      { status: 403 }
    );
  }
  if (touchedUsage && !perms["members.edit_usage"]) {
    return NextResponse.json(
      { error: "회원 이용정보 수정 권한이 없습니다" },
      { status: 403 }
    );
  }
  // 얼굴(생체) 등록·삭제는 별도 권한(members.face)
  const touchedFace =
    patch.face_image_data !== undefined ||
    patch.face_image_thumb !== undefined ||
    patch.face_descriptor !== undefined;
  if (touchedFace && !perms["members.face"]) {
    return NextResponse.json({ error: "얼굴(생체) 등록·삭제 권한이 없습니다" }, { status: 403 });
  }
  // 마일리지 개별 수정도 마일리지 권한(members.mileage)
  if (patch.mileage !== undefined && !perms["members.mileage"]) {
    return NextResponse.json({ error: "마일리지 조정 권한이 없습니다" }, { status: 403 });
  }

  // 변경 전 스냅샷 (diff 로 audit log 에 기록)
  const { data: before } = await supabase
    .from("crm_members")
    .select("*")
    .eq("id", memberId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();

  const { error: updErr } = await supabase
    .from("crm_members")
    .update(patch as never)
    .eq("id", memberId)
    .eq("center_id", ctx.centerId);

  if (updErr) {
    return NextResponse.json({ error: "수정 실패", detail: updErr.message }, { status: 500 });
  }

  // 실제 변경된 필드만 before/after diff 로 기록
  const beforeRow = (before ?? {}) as Record<string, unknown>;
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (beforeRow[k] !== v) {
      changes[k] = { from: beforeRow[k] ?? null, to: v };
    }
  }
  if (Object.keys(changes).length > 0) {
    await supabase.from("crm_audit_logs").insert({
      center_id: ctx.centerId,
      actor_uid: ctx.uid,
      action: "member.update",
      entity_type: "member",
      entity_id: memberId,
      payload: { changes } as never,
    });
  }

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/crm/members/[id]
 * soft delete (status='deleted'). members.delete 권한 필요.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const perms = await loadPermissionsForContext(ctx);
  if (!perms["members.delete"]) {
    return NextResponse.json({ error: "회원 삭제 권한이 없습니다" }, { status: 403 });
  }

  const { id } = await params;
  const memberId = Number(id);
  if (!memberId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { error } = await supabase
    .from("crm_members")
    .update({ status: "deleted" } as never)
    .eq("id", memberId)
    .eq("center_id", ctx.centerId);

  if (error) {
    return NextResponse.json({ error: "삭제 실패", detail: error.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "member.delete",
    entity_type: "member",
    entity_id: memberId,
    payload: null,
  });

  return NextResponse.json({ ok: true });
}
