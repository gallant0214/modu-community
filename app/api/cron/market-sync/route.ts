import { NextResponse } from "next/server";
import { syncFacilities } from "@/app/lib/market-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/market-sync — 주 1회(vercel.json).
 * 전국체육시설 목록을 이어받아 수집한다(한 실행에 최대 80페이지).
 * 전국 154페이지라 한 바퀴에 못 끝나면 다음 주 실행이 남은 페이지부터 이어받는다.
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
  const report = await syncFacilities({ maxPages: 80 });
  return NextResponse.json({ report });
}
