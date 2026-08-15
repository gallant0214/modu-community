import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/members/[id]/next-start?type=membership|apparel|locker
 * 같은 종류의 유효한(만료 전) 이용권이 이미 있으면, 그 최종 만료일 다음날을
 * 새 이용권 시작일로 계산해 반환. 없으면 오늘(KST).
 * → 추가 결제 시 기존 이용권이 끝난 뒤부터 이어서 시작되도록.
 * 응답: { start_date: "YYYY-MM-DD", chained: boolean, after?: "YYYY-MM-DD" }
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const memberId = Number(id) || 0;
  const type = new URL(request.url).searchParams.get("type") || "membership";

  // KST 오늘
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const todayYmd = kstNow.toISOString().slice(0, 10);

  const isUnlimited = (ymd: string) => !ymd || ymd.startsWith("9999") || ymd.startsWith("2999");

  // 종류별 유효(만료 전) 보유분의 최종 만료일
  let maxExpiry: string | null = null;
  if (memberId) {
    if (type === "membership") {
      const { data } = await supabase
        .from("crm_memberships")
        .select("expires_at")
        .eq("center_id", ctx.centerId)
        .eq("member_id", memberId)
        .eq("status", "valid")
        .gte("expires_at", todayYmd)
        .order("expires_at", { ascending: false })
        .limit(1);
      maxExpiry = data?.[0]?.expires_at ?? null;
    } else if (type === "apparel" || type === "rental") {
      const { data } = await supabase
        .from("crm_rentals")
        .select("expires_at")
        .eq("center_id", ctx.centerId)
        .eq("member_id", memberId)
        .in("status", ["valid", "active"])
        .gte("expires_at", todayYmd)
        .order("expires_at", { ascending: false })
        .limit(1);
      maxExpiry = data?.[0]?.expires_at ?? null;
    } else if (type === "locker") {
      const { data } = await supabase
        .from("crm_lockers")
        .select("expires_at")
        .eq("center_id", ctx.centerId)
        .eq("assigned_member_id", memberId)
        .eq("state", "assigned")
        .gte("expires_at", todayYmd)
        .order("expires_at", { ascending: false })
        .limit(1);
      maxExpiry = data?.[0]?.expires_at ?? null;
    }
  }

  if (!maxExpiry || isUnlimited(maxExpiry)) {
    return NextResponse.json({ start_date: todayYmd, chained: false });
  }

  // 최종 만료일 다음날
  const d = new Date(`${maxExpiry.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const next = d.toISOString().slice(0, 10);
  // 혹시 과거면 오늘로 (만료가 오늘 이후라 보통은 미래)
  const start = next < todayYmd ? todayYmd : next;
  return NextResponse.json({ start_date: start, chained: true, after: maxExpiry });
}
