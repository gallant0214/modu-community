import "server-only";
import { supabase } from "./supabase";
import {
  PERMISSION_GROUPS,
  buildPermissionMatrix,
} from "@/app/crm/_components/role-permissions";

/**
 * 서버 사이드: 특정 role 의 현재 활성 권한 맵(key→boolean) 반환.
 * center 별 override 는 crm_role_permissions 에 저장된 값을 defaults 위에 덮어씀.
 */
export async function loadPermissionsForRole(
  centerId: number,
  role: "owner" | "admin" | "manager" | "trainer"
): Promise<Record<string, boolean>> {
  // owner 는 언제나 전부 true (defaults 로도 그렇지만 안전장치)
  if (role === "owner") {
    const map: Record<string, boolean> = {};
    for (const g of PERMISSION_GROUPS) for (const i of g.items) map[i.key] = true;
    return map;
  }

  const { data } = await supabase
    .from("crm_role_permissions")
    .select("role_key, permission_key, enabled")
    .eq("center_id", centerId);

  const matrix = buildPermissionMatrix(data ?? []);
  return matrix[role] ?? {};
}
