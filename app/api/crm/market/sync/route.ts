import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import { marketKeysConfigured } from "@/app/lib/market-data";
import { syncFacilities, ensureCenterCoords } from "@/app/lib/market-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/crm/market/sync
 * 전국체육시설 목록을 지금 수집한다. 전국이 154페이지라 한 번에 다 못 돌면
 * 페이지 커서가 남아 다음 실행이 이어받는다(응답의 completed 로 확인).
 * body: { maxPages?: number, restart?: boolean }
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "stats.view"))) {
    return NextResponse.json({ error: "통계 권한이 없습니다" }, { status: 403 });
  }

  const keys = marketKeysConfigured();
  if (!keys.dataGoKr) {
    return NextResponse.json({ error: "DATA_GO_KR_KEY 가 설정되지 않았습니다", keys }, { status: 400 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    /* 기본값 */
  }
  const maxPages = Math.min(200, Math.max(1, Math.floor(Number(body.maxPages) || 60)));

  // 반경 기준점부터 확보(없으면 지도에 찍을 중심이 없다)
  const center = await ensureCenterCoords(ctx.centerId);
  const report = await syncFacilities({ maxPages, restart: !!body.restart });

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "market.sync",
    entity_type: "market_facilities",
    entity_id: null,
    payload: { report } as never,
  });

  return NextResponse.json({
    ok: !report.error,
    keys,
    report,
    center: center.point
      ? { ready: true, sido: center.sido, sigungu: center.sigungu }
      : { ready: false, reason: (center as { reason: string }).reason },
  });
}
