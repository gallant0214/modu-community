import { NextResponse } from "next/server";
import { verifyAdminPassword } from "@/app/lib/admin-auth";
import { supabase } from "@/app/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/centers-list — 등록된 센터(kind='center') 목록 + 대표자/사업자 정보
 * body: { password, q? }
 *
 * kind='solo'(개인 CRM) 은 제외. 스코프상 관리자 확인 대상은 실제 사업자 등록 센터만.
 * 사업자등록증(base64) 은 응답 크기 커지므로 목록에는 포함하지 않고 has_business_license 만 노출.
 */
export async function POST(req: Request) {
  const { password, q } = await req.json().catch(() => ({}));
  if (!(await verifyAdminPassword(password))) {
    return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
  }
  try {
    let query = supabase
      .from("crm_centers")
      .select(
        "id, name, kind, status, industry, business_no, phone, postal_code, address, address_detail, region_sido, region_sigungu, logo_data_url, owner_uid, owner_name, owner_birth, owner_gender, owner_phone, business_license_data_url, created_at"
      )
      .eq("kind", "center")
      .order("created_at", { ascending: false })
      .limit(500);
    if (typeof q === "string" && q.trim()) {
      const s = q.trim();
      query = query.or(
        `name.ilike.%${s}%,owner_name.ilike.%${s}%,business_no.ilike.%${s.replace(/\D/g, "")}%,phone.ilike.%${s}%`
      );
    }
    const { data, error } = await query;
    if (error) throw error;
    // 목록 응답은 사업자등록증 dataURL 을 뺀 요약본. 존재 여부만 전달.
    const list = (data ?? []).map((c) => ({
      ...c,
      has_business_license: !!c.business_license_data_url,
      business_license_data_url: undefined,
    }));
    return NextResponse.json({ centers: list });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "센터 목록을 불러올 수 없습니다";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
