import "server-only";
import { supabase } from "./supabase";
import {
  PERMISSION_GROUPS,
  buildPermissionMatrix,
  buildGradePermissionMatrix,
  type GradeMeta,
} from "@/app/crm/_components/role-permissions";
import type { CrmContext } from "./crm-auth";

/** 모든 권한 all-true 맵 (owner / owner 등급용) */
function allTruePermissions(): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const g of PERMISSION_GROUPS) for (const i of g.items) map[i.key] = true;
  return map;
}

/**
 * 서버 사이드: 특정 role 의 현재 활성 권한 맵(key→boolean) 반환.
 * center 별 override 는 crm_role_permissions 에 저장된 값을 defaults 위에 덮어씀.
 */
export async function loadPermissionsForRole(
  centerId: number,
  role: "owner" | "admin" | "manager" | "trainer"
): Promise<Record<string, boolean>> {
  // owner 는 언제나 전부 true (defaults 로도 그렇지만 안전장치)
  if (role === "owner") return allTruePermissions();

  const { data } = await supabase
    .from("crm_role_permissions")
    .select("role_key, permission_key, enabled")
    .eq("center_id", centerId);

  const matrix = buildPermissionMatrix(data ?? []);
  return matrix[role] ?? {};
}

/**
 * 서버 사이드: 특정 등급(grade_id) 의 현재 활성 권한 맵 반환.
 * crm_grade_permissions override 를 등급 base_role 기본값 위에 덮어씀.
 * owner 등급은 전부 true.
 */
export async function loadPermissionsForGrade(
  centerId: number,
  gradeId: number
): Promise<Record<string, boolean>> {
  const { data: grade } = await supabase
    .from("crm_grades")
    .select("id, base_role, label")
    .eq("id", gradeId)
    .eq("center_id", centerId)
    .maybeSingle();

  if (!grade) return {};
  if (grade.base_role === "owner") return allTruePermissions();

  const { data: saved } = await supabase
    .from("crm_grade_permissions")
    .select("grade_id, permission_key, enabled")
    .eq("center_id", centerId)
    .eq("grade_id", gradeId);

  const matrix = buildGradePermissionMatrix(
    [grade as GradeMeta],
    saved ?? []
  );
  return matrix[gradeId] ?? {};
}

/**
 * 컨텍스트 기반 권한 로드 — 등급(grade_id) 이 있으면 등급별 권한,
 * 없으면(레거시 멤버) role 기반으로 폴백.
 */
export async function loadPermissionsForContext(
  ctx: CrmContext
): Promise<Record<string, boolean>> {
  if (ctx.role === "owner") return allTruePermissions();
  if (ctx.gradeId) return loadPermissionsForGrade(ctx.centerId, ctx.gradeId);
  return loadPermissionsForRole(ctx.centerId, ctx.role);
}
