import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import {
  ENABLED_BIZ_TYPES,
  bizTypeOf,
  haversineKm,
  marketKeysConfigured,
} from "@/app/lib/market-data";
import { ensureCenterCoords } from "@/app/lib/market-sync";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/market/nearby?radius=3&months=12&type=gym
 * 센터 반경 내 경쟁업체 현황 + 기간 내 신규 개업·폐업 추이.
 *
 * 거리 계산은 수집된 업소 중 **좌표가 확보된 것**만 대상이다(coverage 로 함께 반환).
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "stats.view"))) {
    return NextResponse.json({ error: "통계 권한이 없습니다" }, { status: 403 });
  }

  const url = new URL(request.url);
  const radiusKm = Math.min(20, Math.max(0.5, Number(url.searchParams.get("radius")) || 3));
  const months = Math.min(60, Math.max(3, Math.floor(Number(url.searchParams.get("months")) || 12)));
  const bizType = url.searchParams.get("type") || ENABLED_BIZ_TYPES[0]?.key || "gym";
  if (!bizTypeOf(bizType)) {
    return NextResponse.json({ error: "알 수 없는 업종" }, { status: 400 });
  }

  const keys = marketKeysConfigured();
  const center = await ensureCenterCoords(ctx.centerId);

  const base = {
    radiusKm,
    months,
    bizType,
    bizTypes: ENABLED_BIZ_TYPES.map((b) => ({ key: b.key, label: b.label })),
    keys,
  };

  if (!center.point) {
    return NextResponse.json({
      ...base,
      center: { ready: false, address: center.address, reason: (center as { reason: string }).reason },
      summary: { registered: 0, opened: 0, closed: 0, net: 0 },
      monthLabels: [],
      series: { opened: [], closed: [] },
      list: [],
      coverage: { total: 0, geocoded: 0, pending: 0, failed: 0 },
      lastSyncedAt: null,
    });
  }

  const { lat, lng } = center.point;

  // 반경을 감싸는 사각형으로 먼저 좁힌다(전국 스캔 방지). 1도 ≈ 111km.
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.cos((lat * Math.PI) / 180) || 1);

  interface Row {
    mgt_no: string;
    biz_name: string | null;
    road_addr: string | null;
    lot_addr: string | null;
    lat: number | null;
    lng: number | null;
    opened_on: string | null;
    closed_on: string | null;
    is_open: boolean;
  }

  // Supabase 기본 1000행 제한 — range 페이지네이션으로 전부 읽는다
  const rows: Row[] = [];
  for (let page = 0; page < 100; page++) {
    const from = page * 1000;
    const { data, error } = await supabase
      .from("crm_market_facilities")
      .select("mgt_no, biz_name, road_addr, lot_addr, lat, lng, opened_on, closed_on, is_open")
      .eq("biz_type", bizType)
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

  // 최근 N개월 라벨 (KST 기준)
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const monthLabels: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth() - i, 1));
    monthLabels.push(d.toISOString().slice(0, 7));
  }
  const idxOf = new Map(monthLabels.map((m, i) => [m, i]));
  const openedSeries = new Array(months).fill(0);
  const closedSeries = new Array(months).fill(0);

  let opened = 0;
  let closed = 0;
  for (const r of within) {
    const oi = r.opened_on ? idxOf.get(r.opened_on.slice(0, 7)) : undefined;
    if (oi !== undefined) {
      openedSeries[oi] += 1;
      opened += 1;
    }
    const ci = r.closed_on ? idxOf.get(r.closed_on.slice(0, 7)) : undefined;
    if (ci !== undefined) {
      closedSeries[ci] += 1;
      closed += 1;
    }
  }

  // 목록 — 기간 내 신규 개업분을 최신순으로(경쟁업체 파악이 목적)
  const since = monthLabels[0];
  const list = within
    .filter((r) => r.opened_on && r.opened_on.slice(0, 7) >= since)
    .sort((a, b) => String(b.opened_on).localeCompare(String(a.opened_on)))
    .slice(0, 100)
    .map((r) => ({
      mgtNo: r.mgt_no,
      name: r.biz_name,
      address: r.road_addr || r.lot_addr,
      distanceKm: Math.round(r.distanceKm * 10) / 10,
      openedOn: r.opened_on,
      closedOn: r.closed_on,
      isOpen: r.is_open,
    }));

  // 수집·좌표 확보 현황 (같은 시군구 기준)
  const coverage = { total: 0, geocoded: 0, pending: 0, failed: 0 };
  const countBy = async (state?: string) => {
    let q = supabase
      .from("crm_market_facilities")
      .select("mgt_no", { count: "exact", head: true })
      .eq("biz_type", bizType);
    if (center.sigungu) q = q.eq("sigungu", center.sigungu);
    if (state) q = q.eq("geocode_state", state);
    const { count } = await q;
    return count ?? 0;
  };
  coverage.total = await countBy();
  coverage.geocoded = await countBy("ok");
  coverage.pending = await countBy("pending");
  coverage.failed = await countBy("failed");

  const { data: syncRow } = await supabase
    .from("crm_market_sync_state")
    .select("last_synced_at")
    .eq("biz_type", bizType)
    .maybeSingle();

  return NextResponse.json({
    ...base,
    center: {
      ready: true,
      lat,
      lng,
      address: center.address,
      sido: center.sido,
      sigungu: center.sigungu,
    },
    summary: {
      registered: within.filter((r) => r.is_open).length,
      opened,
      closed,
      net: opened - closed,
    },
    monthLabels,
    series: { opened: openedSeries, closed: closedSeries },
    list,
    coverage,
    lastSyncedAt: (syncRow as { last_synced_at?: string } | null)?.last_synced_at ?? null,
  });
}
