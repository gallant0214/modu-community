import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { syncFacilities, geocodePending } from "@/app/lib/market-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/market-sync — 주 1회(vercel.json).
 * LOCALDATA 인허가 데이터 증분 수집(최근 6개월) + 미확보 좌표 지오코딩.
 * 센터가 등록된 시군구를 우선 지오코딩한다.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.LOCALDATA_API_KEY) {
    return NextResponse.json({ skipped: "LOCALDATA_API_KEY 미설정" });
  }

  const reports = await syncFacilities({ months: 6, maxPages: 20 });

  // 센터들이 실제로 쓰는 지역부터 좌표를 채운다
  const { data: centers } = await supabase
    .from("crm_centers")
    .select("region_sido, region_sigungu")
    .eq("status", "active");
  const regions = Array.from(
    new Map(
      ((centers ?? []) as { region_sido: string | null; region_sigungu: string | null }[])
        .filter((c) => c.region_sido)
        .map((c) => [`${c.region_sido}|${c.region_sigungu}`, c])
    ).values()
  );

  const geocodes: unknown[] = [];
  let budget = 600;
  for (const r of regions) {
    if (budget <= 0) break;
    const limit = Math.min(300, budget);
    const g = await geocodePending({
      sido: r.region_sido ?? undefined,
      sigungu: r.region_sigungu ?? undefined,
      limit,
    });
    budget -= g.ok + g.failed;
    geocodes.push({ region: `${r.region_sido} ${r.region_sigungu ?? ""}`.trim(), ...g });
  }

  return NextResponse.json({ reports, geocodes });
}
