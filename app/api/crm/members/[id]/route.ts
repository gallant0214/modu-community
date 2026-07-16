import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { loadPermissionsForRole } from "@/app/lib/crm-permissions";

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

  const { data: member, error } = await supabase
    .from("crm_members")
    .select(
      "id, member_type, name, phone, email, birth, gender, linked_firebase_uid, memo, status, address, visit_route, workout_goal, counselor, mileage, marketing_consent, registered_at, registration_type, first_use_at, total_paid_won, final_expire_at, last_purchase_at, last_attended_at, attendance_no, current_membership, current_pass, current_rental, current_locker, created_at"
    )
    .eq("id", memberId)
    .eq("center_id", ctx.centerId)
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
    .eq("center_id", ctx.centerId)
    .eq("member_id", memberId)
    .neq("status", "deleted")
    .order("issued_at", { ascending: false });

  if (ctx.role === "trainer" || ctx.role === "manager") {
    passQuery = passQuery.eq("trainer_member_id", ctx.centerMemberId);
  }

  const { data: passes } = await passQuery;

  // trainer/manager 는 본인 담당 회원이 아닐 때 차단
  if ((ctx.role === "trainer" || ctx.role === "manager") && (passes ?? []).length === 0) {
    return NextResponse.json({ error: "이 회원에 대한 접근 권한이 없습니다" }, { status: 403 });
  }

  return NextResponse.json({ member, passes: passes ?? [] });
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
]);

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

  const perms = await loadPermissionsForRole(ctx.centerId, ctx.role);

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

  const perms = await loadPermissionsForRole(ctx.centerId, ctx.role);
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
