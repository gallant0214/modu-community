import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import {
  MARKET_BIZ_TYPES,
  PRIMARY_BIZ_TYPE,
  bizTypeOf,
  haversineKm,
  marketKeysConfigured,
} from "@/app/lib/market-data";
import { ensureCenterCoords } from "@/app/lib/market-sync";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/market/nearby?radius=1&months=12&type=gym
 * 센터 반경 내 경쟁 체육시설 현황.
 *
 * 🚨 출처(전국체육시설 정보)에 **개업일이 없다.** 그래서 '신규'는 개업일이 아니라
 *    우리가 처음 관측한 시점(first_seen_at) 기준이며, 수집을 시작한 뒤부터만 의미가 있다.
 *    폐업(closed_on)은 원본 데이터라 과거분도 정확하다.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "stats.view"))) {
    return NextResponse.json({ error: "통계 권한이 없습니다" }, { status: 403 });
  }

  const url = new URL(request.url);
  const radiusKm = Math.min(20, Math.max(0.5, Number(url.searchParams.get("radius")) || 1));
  const months = Math.min(60, Math.max(3, Math.floor(Number(url.searchParams.get("months")) || 12)));
  const bizType = url.searchParams.get("type") || PRIMARY_BIZ_TYPE;
  if (!bizTypeOf(bizType)) {
    return NextResponse.json({ error: "알 수 없는 업종" }, { status: 400 });
  }

  const keys = marketKeysConfigured();
  const center = await ensureCenterCoords(ctx.centerId);

  const { data: syncRow } = await supabase
    .from("crm_market_sync_state")
    .select("last_synced_at, last_page, total_count, last_result")
    .eq("biz_type", "kspo_faci")
    .maybeSingle();
  const sync = (syncRow ?? null) as {
    last_synced_at?: string;
    last_page?: number;
    total_count?: number;
  } | null;

  const base = {
    radiusKm,
    months,
    bizType,
    bizTypes: MARKET_BIZ_TYPES.map((b) => ({ key: b.key, label: b.label })),
    keys,
    sync: {
      lastSyncedAt: sync?.last_synced_at ?? null,
      // last_page 가 0 이면 전국을 한 바퀴 다 돌았다는 뜻
      inProgress: (sync?.last_page ?? 0) > 0,
      progressPage: sync?.last_page ?? 0,
      totalPages: sync?.total_count ? Math.ceil(sync.total_count / 1000) : 0,
    },
  };

  if (!center.point) {
    return NextResponse.json({
      ...base,
      center: { ready: false, address: center.address, reason: (center as { reason: string }).reason },
      summary: { operating: 0, newlySeen: 0, closed: 0, net: 0 },
      monthLabels: [],
      series: { newlySeen: [], closed: [] },
      list: [],
      byType: [],
    });
  }

  const { lat, lng } = center.point;
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.cos((lat * Math.PI) / 180) || 1);

  interface Row {
    mgt_no: string;
    biz_name: string | null;
    svc_name: string | null;
    ftype_name: string | null;
    road_addr: string | null;
    lot_addr: string | null;
    biz_type: string;
    lat: number | null;
    lng: number | null;
    closed_on: string | null;
    is_open: boolean;
    first_seen_at: string;
  }

  // 반경 사각형 안의 모든 업종을 한 번에 읽는다(업종별 개수도 같이 보여주려고)
  const rows: Row[] = [];
  for (let page = 0; page < 100; page++) {
    const from = page * 1000;
    const { data, error } = await supabase
      .from("crm_market_facilities")
      .select(
        "mgt_no, biz_name, svc_name, ftype_name, road_addr, lot_addr, biz_type, lat, lng, closed_on, is_open, first_seen_at"
      )
      .not("lat", "is", null)
      .gte("lat", lat - dLat)
      .lte("lat", lat + dLat)
      .gte("lng", lng - dLng)
      .lte("lng", lng + dLng)
      .range(from, from + 999);
    if (error || !data) break;
    rows.push(...(data as Row[]));
    if (data.length < 1000) break;
  }

  const within = rows
    .map((r) => ({ ...r, distanceKm: haversineKm(lat, lng, r.lat as number, r.lng as number) }))
    .filter((r) => r.distanceKm <= radiusKm);

  // 업종별 영업 중 개수 (반경 내)
  const byType = MARKET_BIZ_TYPES.map((b) => ({
    key: b.key,
    label: b.label,
    count: within.filter((r) => r.biz_type === b.key && r.is_open).length,
  })).filter((t) => t.count > 0 || t.key === bizType);

  const mine = within.filter((r) => r.biz_type === bizType);

  // 최근 N개월 라벨 (KST)
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const monthLabels: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth() - i, 1));
    monthLabels.push(d.toISOString().slice(0, 7));
  }
  const idxOf = new Map(monthLabels.map((m, i) => [m, i]));
  const seenSeries = new Array(months).fill(0);
  const closedSeries = new Array(months).fill(0);
  let newlySeen = 0;
  let closed = 0;

  for (const r of mine) {
    const si = idxOf.get(String(r.first_seen_at).slice(0, 7));
    if (si !== undefined) {
      seenSeries[si] += 1;
      newlySeen += 1;
    }
    const ci = r.closed_on ? idxOf.get(r.closed_on.slice(0, 7)) : undefined;
    if (ci !== undefined) {
      closedSeries[ci] += 1;
      closed += 1;
    }
  }

  const list = mine
    .slice()
    .sort((a, b) => Number(a.is_open === false) - Number(b.is_open === false) || a.distanceKm - b.distanceKm)
    .slice(0, 200)
    .map((r) => ({
      id: r.mgt_no,
      name: r.biz_name,
      category: r.ftype_name || r.svc_name,
      address: r.road_addr || r.lot_addr,
      distanceKm: Math.round(r.distanceKm * 10) / 10,
      closedOn: r.closed_on,
      isOpen: r.is_open,
    }));

  return NextResponse.json({
    ...base,
    center: { ready: true, lat, lng, address: center.address, sido: center.sido, sigungu: center.sigungu },
    summary: {
      operating: mine.filter((r) => r.is_open).length,
      newlySeen,
      closed,
      net: newlySeen - closed,
    },
    monthLabels,
    series: { newlySeen: seenSeries, closed: closedSeries },
    list,
    byType,
  });
}
