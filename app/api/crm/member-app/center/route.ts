import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/member-app/center?centerId=
 * 내가 소속된 센터의 공개 정보 (센터CRM → 센터설정 → 센터정보 에서 입력한 값).
 */
export async function GET(request: Request) {
  const centerId = Number(new URL(request.url).searchParams.get("centerId"));
  const ctx = await requireMemberForCenter(request, centerId);
  if (isMemberError(ctx)) return ctx;

  const [{ data: c }, { data: s }] = await Promise.all([
    supabase
      .from("crm_centers")
      .select("id, name, phone, address, region_sido, region_sigungu, naver_url, google_url, instagram_id, youtube_url")
      .eq("id", ctx.centerId)
      .maybeSingle(),
    supabase
      .from("crm_center_settings")
      .select("working_hours_start, working_hours_end")
      .eq("center_id", ctx.centerId)
      .maybeSingle(),
  ]);
  if (!c) return NextResponse.json({ error: "센터를 찾을 수 없습니다" }, { status: 404 });

  const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null);

  return NextResponse.json({
    center: {
      id: c.id,
      name: c.name,
      phone: c.phone,
      address: c.address,
      region: [c.region_sido, c.region_sigungu].filter(Boolean).join(" ") || null,
      workingHoursStart: hhmm(s?.working_hours_start),
      workingHoursEnd: hhmm(s?.working_hours_end),
      naverUrl: c.naver_url,
      googleUrl: c.google_url,
      instagramId: c.instagram_id,
      youtubeUrl: c.youtube_url,
    },
  });
}
