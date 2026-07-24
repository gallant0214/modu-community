import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { loadPermissionsForContext } from "@/app/lib/crm-permissions";
import type { CrmContext } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/centers/mine
 * 내가 등록(가입)한 센터 목록. 여러 센터에서 일하는 강사용.
 * active(정상) + pending(승인대기) 모두 반환.
 */
export async function GET(request: Request) {
  const user = await verifyAuth(request);
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("crm_center_members")
    .select(
      "id, center_id, role, grade_id, access_level, is_solo_owner, status, joined_at, crm_centers!inner(name, kind, region_sido, region_sigungu, address)"
    )
    .eq("firebase_uid", user.uid)
    .in("status", ["active", "pending"])
    .order("is_solo_owner", { ascending: false })
    .order("joined_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  const centers = await Promise.all(
    (data ?? []).map(async (m) => {
      const c = Array.isArray(m.crm_centers) ? m.crm_centers[0] : m.crm_centers;
      // 진입 가능 여부: 개인(solo)·owner 는 항상 허용. 승인 대기(pending)는 불가.
      // 그 외에는 해당 등급의 'center.access_crm' 권한으로 판단.
      let accessAllowed = true;
      if (m.status === "pending") {
        accessAllowed = false;
      } else if (!m.is_solo_owner && m.role !== "owner") {
        const perms = await loadPermissionsForContext({
          centerId: m.center_id,
          role: m.role,
          gradeId: m.grade_id ?? null,
        } as CrmContext);
        accessAllowed = perms["center.access_crm"] !== false;
      }
      return {
        centerMemberId: m.id,
        centerId: m.center_id,
        centerName: c?.name ?? "",
        centerKind: c?.kind ?? "center",
        region: [c?.region_sido, c?.region_sigungu].filter(Boolean).join(" ") || null,
        address: c?.address ?? null,
        role: m.role,
        accessLevel: m.is_solo_owner ? "admin" : m.access_level,
        isSoloOwner: m.is_solo_owner,
        status: m.status, // active | pending
        accessAllowed,
      };
    })
  );

  return NextResponse.json({ centers });
}
