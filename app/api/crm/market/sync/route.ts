import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import { marketKeysConfigured } from "@/app/lib/market-data";
import { syncFacilities, geocodePending, ensureCenterCoords } from "@/app/lib/market-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/crm/market/sync
 * LOCALDATA 인허가 데이터 수집 + 좌표 변환을 지금 실행한다.
 * body: { months?: number, maxPages?: number, geocodeLimit?: number }
 *
 * 최초 1회는 과거분을 끌어오기 위해 months 를 크게(예: 240) 줘서 돌리고,
 * 이후에는 주간 크론이 최근분만 증분 수집한다.
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "stats.view"))) {
    return NextResponse.json({ error: "통계 권한이 없습니다" }, { status: 403 });
  }

  const keys = marketKeysConfigured();
  if (!keys.localdata) {
    return NextResponse.json(
      { error: "LOCALDATA_API_KEY 가 설정되지 않았습니다", keys },
      { status: 400 }
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    /* 기본값 사용 */
  }
  const months = Math.min(600, Math.max(1, Math.floor(Number(body.months) || 24)));
  const maxPages = Math.min(200, Math.max(1, Math.floor(Number(body.maxPages) || 20)));
  const geocodeLimit = Math.min(1000, Math.max(0, Math.floor(Number(body.geocodeLimit) ?? 300)));

  const reports = await syncFacilities({ months, maxPages });

  // 센터 좌표(반경 기준점) 확보 → 그 시군구부터 우선 지오코딩
  const center = await ensureCenterCoords(ctx.centerId);
  const geocode = await geocodePending({
    sido: center.sido || undefined,
    sigungu: center.sigungu || undefined,
    limit: geocodeLimit,
  });

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "market.sync",
    entity_type: "market_facilities",
    entity_id: null,
    payload: { months, maxPages, reports, geocode } as never,
  });

  return NextResponse.json({
    ok: true,
    keys,
    months,
    reports,
    geocode,
    center: center.point
      ? { ready: true, sido: center.sido, sigungu: center.sigungu }
      : { ready: false, reason: (center as { reason: string }).reason },
  });
}
