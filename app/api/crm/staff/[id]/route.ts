import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError, type CrmRole } from "@/app/lib/crm-auth";
import { loadPermissionsForContext, ctxHasPermission } from "@/app/lib/crm-permissions";
import { residentHash, residentBirth } from "@/app/lib/crm-identity";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES: CrmRole[] = ["owner", "admin", "manager", "trainer"];

// 역할 서열 — 상위 역할을 하위가 부여하지 못하도록(권한 상승 방지)
const ROLE_RANK: Record<string, number> = { owner: 3, admin: 2, manager: 1, trainer: 0, fc: 0, alba: 0 };

/**
 * GET /api/crm/staff/[id] — 직원 상세 + 권한 row
 *
 * 접근:
 *  - owner/admin/manager 등급 (센터 관리자) 전체 조회 가능
 *  - trainer 는 본인(id === ctx.centerMemberId) 만 조회 가능
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const memberId = Number(id);
  if (!memberId) {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const isManagerish = ctx.role === "owner" || ctx.role === "admin" || ctx.role === "manager";
  const isSelf = memberId === ctx.centerMemberId;
  if (!isManagerish && !isSelf) {
    return NextResponse.json({ error: "본인 정보만 조회할 수 있습니다" }, { status: 403 });
  }

  const { data: member, error } = await supabase
    .from("crm_center_members")
    .select(
      "id, firebase_uid, role, grade_id, display_name, phone, email, address, employment_status, employment_type, access_level, is_solo_owner, status, joined_at, left_at, commission_type, commission_rate, commission_tiers, base_salary, cash_pay_enabled, cash_pay_won, commission_bonuses, birth, resident_hash"
    )
    .eq("id", memberId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  if (!member) {
    return NextResponse.json({ error: "직원을 찾을 수 없습니다" }, { status: 404 });
  }

  // 주민번호 해시는 절대 노출 금지 → 등록 여부(has_resident)만 전달
  const m = member as typeof member & { resident_hash?: string | null };
  const safeMember = { ...m, has_resident: !!m.resident_hash };
  delete (safeMember as { resident_hash?: unknown }).resident_hash;

  const { data: perms } = await supabase
    .from("crm_trainer_permissions")
    .select(
      "center_member_id, can_create_reservation, can_modify_reservation, can_cancel_reservation, attendance_mode, can_cancel_attendance, can_issue_pass, can_manage_all_schedules"
    )
    .eq("center_member_id", memberId)
    .maybeSingle();

  return NextResponse.json({ member: safeMember, permissions: perms ?? null });
}

/**
 * PATCH /api/crm/staff/[id] — 등급/access_level/status/표시명 변경
 *
 * 접근:
 *  - owner/admin/manager: 모든 직원 수정
 *  - trainer(본인): display_name/phone/email/address/birth/resident_no 만 수정 허용
 *
 * 본인(센터의 마지막 owner) 등급을 trainer 로 내려서 센터가 owner 없는 상태가 되는 것 방지.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const memberId = Number(id);
  if (!memberId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const isManagerish = ctx.role === "owner" || ctx.role === "admin" || ctx.role === "manager";
  const isSelf = memberId === ctx.centerMemberId;
  if (!isManagerish && !isSelf) {
    return NextResponse.json({ error: "본인 정보만 수정할 수 있습니다" }, { status: 403 });
  }

  let body: {
    role?: string;
    grade_id?: number | null;
    access_level?: string;
    status?: string;
    display_name?: string;
    phone?: string;
    email?: string;
    address?: string;
    employment_status?: string;
    employment_type?: string | null;
    commission_type?: string;
    commission_rate?: number;
    commission_tiers?: { upTo: number | null; rate: number }[];
    base_salary?: number;
    cash_pay_enabled?: boolean;
    cash_pay_won?: number;
    commission_bonuses?: {
      metric: string;
      gte: number;
      reward_type?: string;
      bonus_won?: number;
      bonus_percent?: number;
    }[];
    birth?: string | null;
    resident_no?: string; // 주민번호 원문 → 해시로만 저장
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  // trainer 본인이 관리자 전용 필드를 건드리려 하면 즉시 차단
  if (!isManagerish) {
    const adminOnlyKeys = [
      "role",
      "grade_id",
      "access_level",
      "status",
      "employment_status",
      "employment_type",
      "commission_type",
      "commission_rate",
      "commission_tiers",
      "base_salary",
      "cash_pay_enabled",
      "cash_pay_won",
      "commission_bonuses",
    ] as const;
    const blocked = adminOnlyKeys.find((k) => (body as Record<string, unknown>)[k] !== undefined);
    if (blocked) {
      return NextResponse.json({ error: "본인이 수정할 수 없는 항목입니다" }, { status: 403 });
    }
  }

  // 직원의 역할/등급/접근권한/재직상태 변경은 staff.manage 권한 필요 (팀장도 토글 없으면 불가)
  const touchesStaffCore =
    body.role !== undefined ||
    body.grade_id !== undefined ||
    body.access_level !== undefined ||
    body.status !== undefined ||
    body.employment_status !== undefined ||
    body.employment_type !== undefined;
  if (touchesStaffCore && !isSelf && !(await ctxHasPermission(ctx, "staff.manage"))) {
    return NextResponse.json({ error: "직원 관리 권한이 없습니다" }, { status: 403 });
  }

  const patch: Record<string, unknown> = {};

  // 본인 확인 정보(생년월일·주민번호) — 센터 탈퇴/양도 방지용
  if (body.birth !== undefined) {
    patch.birth = body.birth?.trim() || null;
  }
  if (body.resident_no !== undefined) {
    const trimmed = body.resident_no.trim();
    const hash = residentHash(trimmed);
    if (trimmed && !hash) {
      return NextResponse.json({ error: "주민번호 13자리를 정확히 입력해 주세요" }, { status: 400 });
    }
    patch.resident_hash = hash;
    // 원본을 평문 그대로 text 컬럼에 저장. 조회는 GET /resident 에서 본인/대표자만 반환.
    // 컬럼명은 마이그 이력상 resident_encrypted 이지만 실제로는 평문 문자열 저장.
    patch.resident_encrypted = trimmed || null;
    // 생년월일 미입력 시 주민번호 앞 6자리로 자동 채움
    const yymmdd = residentBirth(trimmed);
    if (yymmdd && body.birth === undefined) {
      const yy = Number(yymmdd.slice(0, 2));
      const yyyy = yy <= 30 ? 2000 + yy : 1900 + yy;
      patch.birth = `${yyyy}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
    }
  }

  // 수업료(정산) 설정은 sales.commission_edit 권한 필요
  const touchesCommission =
    body.commission_type !== undefined ||
    body.commission_rate !== undefined ||
    body.commission_tiers !== undefined ||
    body.base_salary !== undefined ||
    body.cash_pay_enabled !== undefined ||
    body.cash_pay_won !== undefined ||
    body.commission_bonuses !== undefined;
  if (touchesCommission) {
    const perms = await loadPermissionsForContext(ctx);
    if (!perms["sales.commission_edit"]) {
      return NextResponse.json({ error: "수업료 설정 권한이 없습니다" }, { status: 403 });
    }
    if (body.cash_pay_enabled !== undefined) {
      patch.cash_pay_enabled = !!body.cash_pay_enabled;
    }
    if (body.cash_pay_won !== undefined) {
      patch.cash_pay_won = Math.max(0, Math.floor(Number(body.cash_pay_won) || 0));
    }
    if (body.commission_bonuses !== undefined) {
      const arr = Array.isArray(body.commission_bonuses) ? body.commission_bonuses : [];
      patch.commission_bonuses = arr
        .filter((b) => b && (b.metric === "revenue" || b.metric === "sessions"))
        .map((b) => {
          const rewardType = b.reward_type === "percent" ? "percent" : "won";
          return {
            metric: b.metric === "sessions" ? "sessions" : "revenue",
            gte: Math.max(0, Math.floor(Number(b.gte) || 0)),
            reward_type: rewardType,
            bonus_won: rewardType === "won" ? Math.max(0, Math.floor(Number(b.bonus_won) || 0)) : 0,
            bonus_percent:
              rewardType === "percent"
                ? Math.max(0, Math.min(1000, Number(b.bonus_percent) || 0))
                : 0,
          };
        })
        .slice(0, 20);
    }
    if (body.base_salary !== undefined) {
      const s = Math.max(0, Math.floor(Number(body.base_salary) || 0));
      patch.base_salary = s;
    }
    if (body.commission_type !== undefined) {
      if (body.commission_type !== "fixed" && body.commission_type !== "tiered") {
        return NextResponse.json({ error: "수업료 유형이 잘못됨" }, { status: 400 });
      }
      patch.commission_type = body.commission_type;
    }
    if (body.commission_rate !== undefined) {
      const r = Number(body.commission_rate);
      patch.commission_rate = Number.isFinite(r) ? Math.max(0, Math.min(100, r)) : 0;
    }
    if (body.commission_tiers !== undefined) {
      const tiers = Array.isArray(body.commission_tiers) ? body.commission_tiers : [];
      patch.commission_tiers = tiers
        .map((t) => ({
          upTo: t.upTo == null ? null : Math.max(0, Math.floor(Number(t.upTo) || 0)),
          rate: Math.max(0, Math.min(100, Number(t.rate) || 0)),
        }))
        .slice(0, 20);
    }
  }

  // 등급(base_role)에 따라 접근 권한 자동 세팅 (owner/admin/manager → admin, trainer → schedule)
  const accessForRole = (role: string): "admin" | "schedule" =>
    role === "trainer" ? "schedule" : "admin";

  // grade_id 변경: 해당 등급의 base_role 로 role + access_level 자동 sync
  if (body.grade_id !== undefined && body.grade_id !== null) {
    const { data: g } = await supabase
      .from("crm_grades")
      .select("id, base_role")
      .eq("id", body.grade_id)
      .eq("center_id", ctx.centerId)
      .maybeSingle();
    if (!g) {
      return NextResponse.json({ error: "등급을 찾을 수 없습니다" }, { status: 400 });
    }
    patch.grade_id = g.id;
    // fc(FC)·alba(아르바이트) 기반 등급은 역할·접근권한상 강사(trainer)로 매핑.
    // (권한은 등급별 설정을 그대로 사용, 메뉴/접근 게이트만 강사 기준)
    const effRole = g.base_role === "fc" || g.base_role === "alba" ? "trainer" : g.base_role;
    // 역할 상한: 본인 서열보다 높은 등급(특히 owner)을 부여할 수 없음
    if ((ROLE_RANK[effRole] ?? 0) > (ROLE_RANK[ctx.role] ?? 0)) {
      return NextResponse.json({ error: "본인보다 상위 역할의 등급은 부여할 수 없습니다" }, { status: 403 });
    }
    patch.role = effRole;
    patch.access_level = accessForRole(effRole);
  } else if (body.role !== undefined) {
    if (!ALLOWED_ROLES.includes(body.role as CrmRole)) {
      return NextResponse.json({ error: "등급 값이 잘못됨" }, { status: 400 });
    }
    if ((ROLE_RANK[body.role] ?? 0) > (ROLE_RANK[ctx.role] ?? 0)) {
      return NextResponse.json({ error: "본인보다 상위 역할은 부여할 수 없습니다" }, { status: 403 });
    }
    patch.role = body.role;
    patch.access_level = accessForRole(body.role);
  }
  if (body.status !== undefined) {
    if (body.status !== "active" && body.status !== "inactive") {
      return NextResponse.json({ error: "상태 값이 잘못됨" }, { status: 400 });
    }
    patch.status = body.status;
    if (body.status === "inactive") patch.left_at = new Date().toISOString();
    else patch.left_at = null;
  }
  if (body.display_name !== undefined) {
    const dn = (body.display_name ?? "").trim();
    if (!dn) return NextResponse.json({ error: "표시명을 입력해주세요" }, { status: 400 });
    patch.display_name = dn;
  }
  // null 이 올 수 있어 옵셔널 체이닝으로 안전하게 trim (앱은 빈 값을 null 로 보냄)
  if (body.phone !== undefined) patch.phone = body.phone?.trim() || null;
  if (body.email !== undefined) patch.email = body.email?.trim() || null;
  if (body.address !== undefined) patch.address = body.address?.trim() || null;
  if (body.employment_status !== undefined) {
    if (!["working", "on_leave", "resigned"].includes(body.employment_status)) {
      return NextResponse.json({ error: "재직상태 값이 잘못됨" }, { status: 400 });
    }
    patch.employment_status = body.employment_status;
    // 재직상태 ↔ 접근상태(status) 항상 동기화 — 드리프트 방지.
    // 퇴사(resigned)=CRM 접근 차단(inactive), 재직/휴직=접근 허용(active).
    // 단, 이 요청에 status 가 명시돼 있으면 그 값을 존중한다.
    if (body.status === undefined) {
      if (body.employment_status === "resigned") {
        patch.status = "inactive";
        patch.left_at = new Date().toISOString();
      } else {
        patch.status = "active";
        patch.left_at = null;
      }
    }
  }
  if (body.employment_type !== undefined) {
    if (body.employment_type && !["regular", "freelance", "part_time"].includes(body.employment_type)) {
      return NextResponse.json({ error: "근무형태 값이 잘못됨" }, { status: 400 });
    }
    patch.employment_type = body.employment_type || null;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "변경할 항목이 없습니다" }, { status: 400 });
  }

  // 본인 자신을 trainer 로 낮추는 거 방지 (CRM 진입 자체가 막힘)
  if ((patch.role === "trainer" || patch.role === "manager") && ctx.centerMemberId === memberId) {
    return NextResponse.json(
      { error: "본인 등급은 직접 낮출 수 없습니다. 다른 관리자에게 요청하세요." },
      { status: 400 }
    );
  }

  // 마지막 owner 보호: 이 직원이 유일한 owner 인데 role 을 owner 가 아닌 값으로 바꾸려는 경우
  if (patch.role && patch.role !== "owner") {
    const { data: cur } = await supabase
      .from("crm_center_members")
      .select("role")
      .eq("id", memberId)
      .maybeSingle();

    if (cur?.role === "owner") {
      const { count } = await supabase
        .from("crm_center_members")
        .select("id", { count: "exact", head: true })
        .eq("center_id", ctx.centerId)
        .eq("role", "owner")
        .eq("status", "active");

      if ((count ?? 0) <= 1) {
        return NextResponse.json(
          { error: "센터에 대표자가 한 명도 없게 됩니다. 다른 직원을 먼저 대표자로 지정하세요." },
          { status: 400 }
        );
      }
    }
  }

  const { error: updErr } = await supabase
    .from("crm_center_members")
    .update(patch as never)
    .eq("id", memberId)
    .eq("center_id", ctx.centerId);

  if (updErr) {
    return NextResponse.json({ error: "수정 실패", detail: updErr.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "staff.update",
    entity_type: "center_member",
    entity_id: memberId,
    payload: patch as never,
  });

  return NextResponse.json({ ok: true });
}
