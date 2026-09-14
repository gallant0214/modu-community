import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { splitRegion } from "@/app/lib/market-data";
import { syncFacilities, geocodePending } from "@/app/lib/market-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/market-sync — 주 1회(vercel.json).
 * 인허가 데이터(공공데이터포털) 증분 수집(최근 6개월) + 미확보 좌표 지오코딩.
 * 센터가 등록된 시군구를 우선 지오코딩한다.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.DATA_GO_KR_KEY) {
    return NextResponse.json({ skipped: "DATA_GO_KR_KEY 미설정" });
  }

  const reports = await syncFacilities({ months: 6, maxPages: 20 });

  // 센터들이 실제로 쓰는 지역부터 좌표를 채운다
  const { data: centers } = await supabase
    .from("crm_centers")
    .select("region_sido, region_sigungu, address")
    .eq("status", "active");
  // region_sido/sigungu 는 비어 있는 센터가 많아 주소 문자열에서 뽑아 폴백한다
  const regions = Array.from(
    new Map(
      ((centers ?? []) as { region_sido: string | null; region_sigungu: string | null; address: string | null }[])
        .map((c) => {
          const parsed = splitRegion(c.address ?? "");
          return {
            sido: (c.region_sido ?? "").trim() || parsed.sido,
            sigungu: (c.region_sigungu ?? "").trim() || parsed.sigungu,
          };
        })
        .filter((r) => r.sido)
        .map((r) => [`${r.sido}|${r.sigungu}`, r])
    ).values()
  );

  const geocodes: unknown[] = [];
  let budget = 600;
  for (const r of regions) {
    if (budget <= 0) break;
    const limit = Math.min(300, budget);
    const g = await geocodePending({ sido: r.sido, sigungu: r.sigungu || undefined, limit });
    budget -= g.ok + g.failed;
    geocodes.push({ region: `${r.sido} ${r.sigungu}`.trim(), ...g });
  }

  return NextResponse.json({ reports, geocodes });
}
