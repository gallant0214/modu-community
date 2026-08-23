import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError, type CrmRole } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES: CrmRole[] = ["owner", "admin", "manager", "trainer"];
const ALLOWED_ACCESS_LEVELS = ["none", "schedule", "admin"] as const;
const ROLE_RANK: Record<string, number> = { owner: 3, admin: 2, manager: 1, trainer: 0, fc: 0, alba: 0 };

/**
 * GET /api/crm/staff
 * 본인 센터의 직원 목록. owner/admin 만 진입.
 * ?scope=names → 이름/직급만 반환(개인정보 제외), 모든 센터 멤버 접근 허용
 *   (강사용 앱에서 담당강사·판매자·추가강사 선택용)
 */
export async function GET(request: Request) {
  const namesOnly = new URL(request.url).searchParams.get("scope") === "names";

  // names 모드는 일반 멤버(trainer 포함)도 접근 가능 — PII 제외
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  // 전체 직원 PII 목록은 직원 관리 권한(staff.manage) 필요
  if (!namesOnly && !(await ctxHasPermission(ctx, "staff.manage"))) {
    return NextResponse.json({ error: "직원 관리 권한이 없습니다" }, { status: 403 });
  }

  if (namesOnly) {
    const { data, error } = await supabase
      .from("crm_center_members")
      .select("id, display_name, role, status")
      .eq("center_id", ctx.centerId)
      .eq("status", "active")
      .order("role", { ascending: false });
    if (error) return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
    return NextResponse.json({ staff: data ?? [] });
  }

  const { data, error } = await supabase
    .from("crm_center_members")
    .select(
      "id, firebase_uid, role, grade_id, display_name, phone, email, address, employment_status, employment_type, access_level, is_solo_owner, status, joined_at, left_at"
    )
    .eq("center_id", ctx.centerId)
    .order("status", { ascending: true })   // active 먼저
    .order("role", { ascending: false })    // owner > trainer 알파벳 역순 ≈ 등급 높은 순 (간이)
    .order("joined_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  // 등급 라벨 매핑 (grade_id → crm_grades.label)
  const gradeIds = Array.from(
    new Set((data ?? []).map((m) => m.grade_id).filter((v): v is number => !!v))
  );
  const gradeMap = new Map<number, string>();
  if (gradeIds.length > 0) {
    const { data: grades } = await supabase
      .from("crm_grades")
      .select("id, label")
      .eq("center_id", ctx.centerId)
      .in("id", gradeIds);
    for (const g of grades ?? []) gradeMap.set(g.id, g.label);
  }

  const staff = (data ?? []).map((m) => ({
    ...m,
    grade_label: m.grade_id ? gradeMap.get(m.grade_id) ?? null : null,
  }));

  return NextResponse.json({ staff });
}

/**
 * POST /api/crm/staff — 직원 추가 (사장님이 직접 등록)
 *
 * body: { firebase_uid, display_name, role, access_level, email?, phone? }
 *
 * 이미 멤버십이 있는 사용자:
 *   - status='inactive' (퇴사) 였으면 → 재활성화 (role/access_level 갱신)
 *   - status='active'   였으면 → 409 (이미 직원입니다)
 *
 * 신규: 멤버십 INSERT + (trainer/manager 면) 권한 row INSERT
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "staff.manage"))) {
    return NextResponse.json({ error: "직원 관리 권한이 없습니다" }, { status: 403 });
  }

  let body: {
    firebase_uid?: string;
    display_name?: string;
    role?: string;
    grade_id?: number;
    access_level?: string;
    email?: string;
    phone?: string;
    address?: string;
    employment_status?: string;
    employment_type?: string;
    /** true 면 앱 회원가입 없이 직접 등록 — 합성 firebase_uid 부여 */
    direct?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const direct = body.direct === true;
  // 직접 등록은 계정이 없으므로 합성 uid 부여(NOT NULL·UNIQUE 충족, 실사용자와 구분되는 manual: 접두)
  const uid = direct ? `manual:${ctx.centerId}:${randomUUID()}` : body.firebase_uid?.trim();
  if (!uid) return NextResponse.json({ error: "사용자를 선택해주세요" }, { status: 400 });

  // grade_id 가 있으면 role 을 grade.base_role 로 sync. 없으면 role 직접 사용.
  let role = body.role as CrmRole | undefined;
  let gradeId: number | null = body.grade_id ?? null;
  if (gradeId) {
    const { data: g } = await supabase
      .from("crm_grades")
      .select("id, base_role")
      .eq("id", gradeId)
      .eq("center_id", ctx.centerId)
      .maybeSingle();
    if (!g) {
      return NextResponse.json({ error: "등급을 찾을 수 없습니다" }, { status: 400 });
    }
    role = g.base_role as CrmRole;
    gradeId = g.id;
  }
  if (!role || !ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: "등급 값이 잘못됨" }, { status: 400 });
  }
  // 역할 상한: 본인 서열보다 높은 역할(특히 owner)의 직원은 만들 수 없음
  if ((ROLE_RANK[role] ?? 0) > (ROLE_RANK[ctx.role] ?? 0)) {
    return NextResponse.json({ error: "본인보다 상위 역할의 직원은 등록할 수 없습니다" }, { status: 403 });
  }

  const accessLevel = body.access_level as (typeof ALLOWED_ACCESS_LEVELS)[number] | undefined;
  if (!accessLevel || !ALLOWED_ACCESS_LEVELS.includes(accessLevel)) {
    return NextResponse.json({ error: "권한 레벨이 잘못됨" }, { status: 400 });
  }

  const displayName = body.display_name?.trim();
  if (!displayName) return NextResponse.json({ error: "표시명을 입력해주세요" }, { status: 400 });

  // 검색 등록만 닉네임 존재 확인 (직접 등록은 계정이 없음)
  if (!direct) {
    const { data: nick } = await supabase
      .from("nicknames")
      .select("name")
      .eq("firebase_uid", uid)
      .maybeSingle();
    if (!nick) {
      return NextResponse.json({ error: "사용자를 찾을 수 없습니다" }, { status: 404 });
    }
  }

  // 기존 멤버십 확인
  const { data: existing } = await supabase
    .from("crm_center_members")
    .select("id, status, role")
    .eq("center_id", ctx.centerId)
    .eq("firebase_uid", uid)
    .maybeSingle();

  if (existing) {
    if (existing.status === "active") {
      return NextResponse.json({ error: "이미 등록된 직원입니다" }, { status: 409 });
    }
    // 퇴사 상태 → 재활성화 + 새 등급으로 갱신
    const { error: upErr } = await supabase
      .from("crm_center_members")
      .update({
        status: "active",
        role,
        grade_id: gradeId,
        access_level: accessLevel,
        display_name: displayName,
        email: body.email?.trim() || null,
        phone: body.phone?.trim() || null,
        address: body.address?.trim() || null,
        employment_status: body.employment_status || "working",
        employment_type: body.employment_type || null,
        left_at: null,
      } as never)
      .eq("id", existing.id);

    if (upErr) {
      return NextResponse.json({ error: "재등록 실패", detail: upErr.message }, { status: 500 });
    }

    // 권한 row 보장
    if (role === "trainer" || role === "manager") {
      await supabase.from("crm_trainer_permissions").upsert(
        { center_member_id: existing.id } as never,
        { onConflict: "center_member_id" }
      );
    }

    await supabase.from("crm_audit_logs").insert({
      center_id: ctx.centerId,
      actor_uid: ctx.uid,
      action: "staff.reactivate",
      entity_type: "center_member",
      entity_id: existing.id,
      payload: { role, access_level: accessLevel } as never,
    });

    return NextResponse.json({ ok: true, memberId: existing.id, reactivated: true });
  }

  // 신규 멤버십 생성
  const { data: created, error: insErr } = await supabase
    .from("crm_center_members")
    .insert({
      center_id: ctx.centerId,
      firebase_uid: uid,
      role,
      grade_id: gradeId,
      display_name: displayName,
      email: body.email?.trim() || null,
      phone: body.phone?.trim() || null,
      address: body.address?.trim() || null,
      employment_status: body.employment_status || "working",
      employment_type: body.employment_type || null,
      access_level: accessLevel,
      is_solo_owner: false,
      status: "active",
    })
    .select("id")
    .single();

  if (insErr || !created) {
    return NextResponse.json({ error: "추가 실패", detail: insErr?.message }, { status: 500 });
  }

  // trainer/manager 면 권한 row 디폴트 (전부 true)
  if (role === "trainer" || role === "manager") {
    await supabase.from("crm_trainer_permissions").insert({
      center_member_id: created.id,
      can_create_reservation: true,
      can_modify_reservation: true,
      can_cancel_reservation: true,
      attendance_mode: "trainer",
      can_cancel_attendance: true,
      can_issue_pass: true,
    });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "staff.add",
    entity_type: "center_member",
    entity_id: created.id,
    payload: { role, access_level: accessLevel, display_name: displayName } as never,
  });

  return NextResponse.json({ ok: true, memberId: created.id });
}
