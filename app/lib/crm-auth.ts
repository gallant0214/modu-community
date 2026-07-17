import "server-only";
import { NextResponse } from "next/server";
import { verifyAuth } from "./firebase-admin";
import { supabase } from "./supabase";

/**
 * CRM 컨텍스트 — 한 사용자가 한 번에 한 센터에서 작업한다는 가정.
 *
 * - role 4단계 ([[feedback-crm-data-isolation]]):
 *   owner    — 대표자, 무조건 전체. accessLevel 자동 admin.
 *   admin    — 관리자, 디폴트 전체 (사장이 토글로 제한 가능)
 *   manager  — 팀장, 본인 팀 + 본인
 *   trainer  — 강사, 본인 데이터만
 *
 * - access_level: 'admin' | 'schedule' | 'none' (PDF 2-1)
 *   owner 는 항상 'admin' 으로 간주
 *
 * - crm_trainer_permissions row: owner 외에 모두 존재 (1차 v1 에선 trainer 만 사용)
 */
export type CrmRole = "owner" | "admin" | "manager" | "trainer";

const ROLE_ORDER: Record<CrmRole, number> = {
  trainer: 0,
  manager: 1,
  admin: 2,
  owner: 3,
};

export interface CrmContext {
  uid: string;
  centerId: number;
  centerMemberId: number;
  role: CrmRole;
  /** 소속 등급 id (crm_grades). 레거시 멤버는 null → role 기반 권한 폴백 */
  gradeId: number | null;
  accessLevel: "admin" | "schedule" | "none";
  isSoloOwner: boolean;
  centerKind: "solo" | "center";
  centerName: string;
}

export interface RequireCrmOptions {
  /** 이 등급 이상만 통과 (hierarchy: owner > admin > manager > trainer) */
  needRole?: CrmRole;
  /** access_level 게이트 (none < schedule < admin) */
  needAccessLevel?: "admin" | "schedule";
}

/**
 * 본인의 활성(active) 멤버십을 1개 가져온다.
 *
 * 멤버십이 여러 개일 경우 우선순위:
 *  1) is_solo_owner = true (본인 솔로 센터)
 *  2) role 등급 높은 순 (owner > admin > manager > trainer)
 *  3) 최신 joined_at
 *
 * v1 에서는 멀티 센터 UI 가 없으니 단순히 우선순위로 단일 선택.
 * 추후 센터 전환 셀렉터가 필요해지면 ?centerId= 쿼리 받게 확장.
 */
export async function requireCrmContext(
  request: Request,
  options: RequireCrmOptions = {}
): Promise<NextResponse | CrmContext> {
  const user = await verifyAuth(request);
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const { data: rows, error } = await supabase
    .from("crm_center_members")
    .select(
      "id, center_id, role, grade_id, access_level, is_solo_owner, status, joined_at, crm_centers!inner(kind, name)"
    )
    .eq("firebase_uid", user.uid)
    .eq("status", "active")
    .order("is_solo_owner", { ascending: false })
    .order("joined_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "DB 오류", detail: error.message }, { status: 500 });
  }

  const membership = rows?.[0];
  if (!membership) {
    return NextResponse.json({ error: "CRM_NOT_ONBOARDED" }, { status: 409 });
  }

  const role = membership.role as CrmRole;
  const accessLevel = (
    role === "owner" ? "admin" : membership.access_level
  ) as "admin" | "schedule" | "none";

  // 권한 게이트
  if (options.needRole && ROLE_ORDER[role] < ROLE_ORDER[options.needRole]) {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }
  if (options.needAccessLevel) {
    const order = { none: 0, schedule: 1, admin: 2 } as const;
    if (order[accessLevel] < order[options.needAccessLevel]) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
    }
  }

  // Supabase nested select 리턴 형태 정규화
  const centerInfo = Array.isArray(membership.crm_centers)
    ? membership.crm_centers[0]
    : (membership.crm_centers as { kind: string; name: string } | null);

  return {
    uid: user.uid,
    centerId: membership.center_id,
    centerMemberId: membership.id,
    role,
    gradeId: membership.grade_id ?? null,
    accessLevel,
    isSoloOwner: membership.is_solo_owner,
    centerKind: (centerInfo?.kind ?? "center") as "solo" | "center",
    centerName: centerInfo?.name ?? "",
  };
}

export function isCrmError(
  ctx: NextResponse | CrmContext
): ctx is NextResponse {
  return ctx instanceof NextResponse;
}

/**
 * Server Component 에서 사용할 컨텍스트 로더.
 * Request 가 없는 layout/page 에서 호출. 인증 실패 시 null 반환 — 호출측에서 redirect.
 */
export async function loadCrmContextForUid(
  uid: string
): Promise<CrmContext | null> {
  const { data: rows } = await supabase
    .from("crm_center_members")
    .select(
      "id, center_id, role, grade_id, access_level, is_solo_owner, status, joined_at, crm_centers!inner(kind, name)"
    )
    .eq("firebase_uid", uid)
    .eq("status", "active")
    .order("is_solo_owner", { ascending: false })
    .order("joined_at", { ascending: false });

  const membership = rows?.[0];
  if (!membership) return null;

  const role = membership.role as CrmRole;
  const accessLevel = (
    role === "owner" ? "admin" : membership.access_level
  ) as "admin" | "schedule" | "none";

  const centerInfo = Array.isArray(membership.crm_centers)
    ? membership.crm_centers[0]
    : (membership.crm_centers as { kind: string; name: string } | null);

  return {
    uid,
    centerId: membership.center_id,
    centerMemberId: membership.id,
    role,
    gradeId: membership.grade_id ?? null,
    accessLevel,
    isSoloOwner: membership.is_solo_owner,
    centerKind: (centerInfo?.kind ?? "center") as "solo" | "center",
    centerName: centerInfo?.name ?? "",
  };
}
