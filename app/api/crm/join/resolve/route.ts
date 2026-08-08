import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/join/resolve?token= | ?code=
 * 공개(무인증) — 가입 QR/코드 → 센터 정보. 랜딩 페이지 + 회원용 앱이 사용.
 * → { centerId, centerName }
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const code = url.searchParams.get("code")?.trim().toUpperCase();

  if (!token && !code) {
    return NextResponse.json({ error: "가입 코드가 필요합니다" }, { status: 400 });
  }

  const base = supabase.from("crm_center_join_links").select("center_id");
  const { data: link } = token
    ? await base.eq("token", token).maybeSingle()
    : await base.eq("code", code as string).maybeSingle();

  if (!link) {
    return NextResponse.json({ error: "유효하지 않은 가입 링크예요" }, { status: 404 });
  }

  const { data: center } = await supabase
    .from("crm_centers")
    .select("id, name, status")
    .eq("id", link.center_id)
    .maybeSingle();

  if (!center || center.status !== "active") {
    return NextResponse.json({ error: "센터를 찾을 수 없어요" }, { status: 404 });
  }

  return NextResponse.json({ centerId: center.id, centerName: center.name });
}
