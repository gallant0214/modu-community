import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { verifyAuth } from "@/app/lib/firebase-admin";

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
      "id, center_id, role, access_level, is_solo_owner, status, joined_at, crm_centers!inner(name, kind, region_sido, region_sigungu, address)"
    )
    .eq("firebase_uid", user.uid)
    .in("status", ["active", "pending"])
    .order("is_solo_owner", { ascending: false })
    .order("joined_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  const centers = (data ?? []).map((m) => {
    const c = Array.isArray(m.crm_centers) ? m.crm_centers[0] : m.crm_centers;
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
    };
  });

  return NextResponse.json({ centers });
}
