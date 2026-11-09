import "server-only";
import { NextResponse } from "next/server";
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
 * 컨텍스트 기반 권한 로드 — 등급(grade_id) 이 있으면 등급별 권한.
 * 등급이 없는 레거시 직원은 **같은 기본 분류(role)의 센터 등급 열**을 따른다.
 *  🚨 예전엔 crm_role_permissions(화면에 안 보이는 표)로 폴백해서, 직급권한 화면의 '강사' 열을
 *     바꿔도 등급 없는 강사에게는 적용되지 않았다(화면과 실제 동작 불일치).
 */
export async function loadPermissionsForContext(
  ctx: CrmContext
): Promise<Record<string, boolean>> {
  if (ctx.role === "owner" || ctx.isSoloOwner) return allTruePermissions();
  if (ctx.gradeId) return loadPermissionsForGrade(ctx.centerId, ctx.gradeId);
  const { data: g } = await supabase
    .from("crm_grades")
    .select("id")
    .eq("center_id", ctx.centerId)
    .eq("base_role", ctx.role)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (g) return loadPermissionsForGrade(ctx.centerId, g.id as number);
  return loadPermissionsForRole(ctx.centerId, ctx.role);
}

/**
 * 직급 권한 검사 — **모든 서버 권한 판정은 이 함수(또는 loadPermissionsForContext)로**.
 * 대표자(owner)·개인 원장(solo)만 무조건 통과. 관리자(admin)를 포함한 나머지는 직급권한 화면의 값 그대로.
 *  🚨 예전엔 admin 도 무조건 통과시켜서, 대표자가 관리자 열에서 꺼둔 권한(매출 삭제 등)이 실제로는 무시됐다.
 *  🚨 needRole·ctx.role 비교로 권한을 막지 말 것 — 화면에 스위치가 없는 '숨은 제한'이 된다.
 *     (scripts/check-crm-permission-gates.mjs 가 빌드에서 막는다)
 */
export async function ctxHasPermission(ctx: CrmContext, key: string): Promise<boolean> {
  if (ctx.role === "owner" || ctx.isSoloOwner) return true;
  const perms = await loadPermissionsForContext(ctx);
  return perms[key] === true;
}

const PERM_LABEL = new Map<string, string>(
  PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => [i.key, i.label] as [string, string]))
);

/**
 * 권한이 없으면 403 응답, 있으면 null.
 * 메시지에 직급권한 항목 이름을 넣어, 막혔을 때 '어디서 무엇을 켜야 하는지' 바로 알 수 있게 한다.
 *   const permDenied = await requirePermission(ctx, "finance.expenses");
 *   if (permDenied) return permDenied;
 */
export async function requirePermission(ctx: CrmContext, key: string): Promise<NextResponse | null> {
  if (await ctxHasPermission(ctx, key)) return null;
  return permissionDeniedResponse(key);
}

/** 직급권한 항목 이름이 들어간 403 응답 */
export function permissionDeniedResponse(key: string): NextResponse {
  const label = (PERM_LABEL.get(key) ?? key).split(" — ")[0];
  return NextResponse.json(
    { error: `권한이 없습니다. 센터설정 → 직급 권한에서 '${label}' 항목을 켜야 해요.`, permission: key },
    { status: 403 }
  );
}
