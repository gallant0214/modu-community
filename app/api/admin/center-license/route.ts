import { NextResponse } from "next/server";
import { verifyAdminPassword } from "@/app/lib/admin-auth";
import { supabase } from "@/app/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/center-license — 사업자등록증 사본(dataURL) 조회
 * body: { password, id }
 * 목록 API 와 분리한 이유: 사본이 base64 로 커서 목록에 실으면 응답 크기 급증.
 * 관리자가 개별 센터 '사업자등록증 확인' 버튼 클릭 시에만 호출.
 */
export async function POST(req: Request) {
  const { password, id } = await req.json().catch(() => ({}));
  if (!(await verifyAdminPassword(password))) {
    return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
  }
  const centerId = Number(id);
  if (!centerId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  const { data, error } = await supabase
    .from("crm_centers")
    .select("id, name, business_license_data_url, business_no, owner_name")
    .eq("id", centerId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "센터를 찾을 수 없습니다" }, { status: 404 });
  return NextResponse.json({
    id: data.id,
    name: data.name,
    business_no: data.business_no,
    owner_name: data.owner_name,
    business_license_data_url: data.business_license_data_url,
  });
}
