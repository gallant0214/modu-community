import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import { isMarketAnalysisCenter, MARKET_LOCKED_MESSAGE } from "@/app/lib/market-access";
import { MARKET_BIZ_TYPES, PRIMARY_BIZ_TYPE, bizTypeOf, haversineKm } from "@/app/lib/market-data";
import { ensureCenterCoords } from "@/app/lib/market-sync";

export const dynamic = "force-dynamic";

/** 규모(연면적) 구간 — 자영업자가 체감하는 크기로 나눈다 */
const SIZE_BANDS = [
  { key: "s", label: "소형 (~100㎡)", min: 0, max: 100 },
  { key: "m", label: "중형 (100~300㎡)", min: 100, max: 300 },
  { key: "l", label: "대형 (300~1000㎡)", min: 300, max: 1000 },
  { key: "xl", label: "초대형 (1000㎡~)", min: 1000, max: Infinity },
];

/** 거리 구간 — 상권 체감 거리 */
const DIST_BANDS = [
  { label: "~500m", min: 0, max: 0.5 },
  { label: "500m~1km", min: 0.5, max: 1 },
  { label: "1~2km", min: 1, max: 2 },
  { label: "2~3km", min: 2, max: 3 },
  { label: "3~5km", min: 3, max: 5 },
];

interface Row {
  mgt_no: string;
  biz_name: string | null;
  svc_name: string | null;
  ftype_name: string | null;
  road_addr: string | null;
  lot_addr: string | null;
  biz_type: string;
  sigungu: string | null;
  emd: string | null;
  gfa: number | null;
  lat: number | null;
  lng: number | null;
  closed_on: string | null;
  is_open: boolean;
  first_seen_at: string;
}

/**
 * GET /api/crm/market/analysis?radius=1&type=gym
 * 자영업자 관점의 상권 지표 묶음.
 *   - 경쟁 밀도(거리대별) / 폐업률 / 연도별 폐업 추이
 *   - 업종 구성(대체재 포함) / 동별 밀집 / 규모 분포 / 가까운 경쟁 목록
 *   - 시군구 평균 대비 밀집도
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "stats.view"))) {
    return NextResponse.json({ error: "통계 권한이 없습니다" }, { status: 403 });
  }

  const { data: centerRow } = await supabase
    .from("crm_centers")
    .select("name")
    .eq("id", ctx.centerId)
    .maybeSingle();
  const centerName = (centerRow as { name?: string } | null)?.name ?? "";
  if (!isMarketAnalysisCenter(centerName)) {
    return NextResponse.json({ error: MARKET_LOCKED_MESSAGE, locked: true }, { status: 403 });
  }

  const url = new URL(request.url);
  const radiusKm = Math.min(10, Math.max(0.5, Number(url.searchParams.get("radius")) || 1));
  const bizType = url.searchParams.get("type") || PRIMARY_BIZ_TYPE;
  if (!bizTypeOf(bizType)) {
    return NextResponse.json({ error: "알 수 없는 업종" }, { status: 400 });
  }

  const center = await ensureCenterCoords(ctx.centerId);
  const { data: syncRow } = await supabase
    .from("crm_market_sync_state")
    .select("last_synced_at, last_page, total_count")
    .eq("biz_type", "kspo_faci")
    .maybeSingle();
  const sync = syncRow as { last_synced_at?: string; last_page?: number; total_count?: number } | null;

  const meta = {
    radiusKm,
    bizType,
    bizTypes: MARKET_BIZ_TYPES.map((b) => ({ key: b.key, label: b.label })),
    centerName,
    sync: {
      lastSyncedAt: sync?.last_synced_at ?? null,
      inProgress: (sync?.last_page ?? 0) > 0,
      progressPage: sync?.last_page ?? 0,
      totalPages: sync?.total_count ? Math.ceil(sync.total_count / 1000) : 0,
    },
  };

  if (!center.point) {
    return NextResponse.json({
      ...meta,
      ready: false,
      reason: (center as { reason: string }).reason,
    });
  }
  const { lat, lng } = center.point;

  // 반경 사각형으로 1차 필터 후 하버사인 (Supabase 기본 1000행 제한 → range 페이지네이션)
  const box = 5.2; // 5km 밴드까지 보므로 여유 있게
  const dLat = box / 111;
  const dLng = box / (111 * Math.cos((lat * Math.PI) / 180) || 1);
  const rows: Row[] = [];
  for (let page = 0; page < 50; page++) {
    const from = page * 1000;
    const { data, error } = await supabase
      .from("crm_market_facilities")
      .select(
        "mgt_no, biz_name, svc_name, ftype_name, road_addr, lot_addr, biz_type, sigungu, emd, gfa, lat, lng, closed_on, is_open, first_seen_at"
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

  const withDist = rows.map((r) => ({
    ...r,
    km: haversineKm(lat, lng, r.lat as number, r.lng as number),
  }));
  const inRadius = withDist.filter((r) => r.km <= radiusKm);
  const mine = inRadius.filter((r) => r.biz_type === bizType);
  const mineOpen = mine.filter((r) => r.is_open);

  // ── 폐업률: 이 상권에서 문 닫은 비율 (영업+폐업 중 폐업)
  const closedCount = mine.length - mineOpen.length;
  const closureRate = mine.length > 0 ? Math.round((closedCount / mine.length) * 1000) / 10 : 0;
  // 폐업률은 기간 제한 없이 '원본에 남아있는 전체 이력' 기준이다.
  // 사용자가 몇 년치인지 알 수 있도록 실제 폐업일의 연도 범위를 함께 내려준다.
  const closedYears = mine
    .map((r) => r.closed_on?.slice(0, 4))
    .filter((y): y is string => !!y && /^\d{4}$/.test(y))
    .map(Number)
    .sort((a, b) => a - b);
  const closureFromYear = closedYears.length > 0 ? closedYears[0] : null;
  const closureToYear = closedYears.length > 0 ? closedYears[closedYears.length - 1] : null;

  // ── 시군구 전체 평균과 비교 (내 반경이 과밀인지)
  const sigungu = center.sigungu;
  let sigunguOpen = 0;
  if (sigungu) {
    const { count } = await supabase
      .from("crm_market_facilities")
      .select("mgt_no", { count: "exact", head: true })
      .eq("biz_type", bizType)
      .eq("is_open", true)
      .eq("sigungu", sigungu);
    sigunguOpen = count ?? 0;
  }

  // ── 거리대별 밀도
  const byDistance = DIST_BANDS.filter((b) => b.min < Math.max(radiusKm, 3)).map((b) => ({
    label: b.label,
    count: withDist.filter((r) => r.biz_type === bizType && r.is_open && r.km >= b.min && r.km < b.max)
      .length,
  }));

  // ── 연도별 폐업 (원본 폐업일 기준이라 과거도 정확)
  const thisYear = new Date(Date.now() + 9 * 3600 * 1000).getUTCFullYear();
  const years = Array.from({ length: 6 }, (_, i) => thisYear - 5 + i);
  const closureByYear = years.map((y) => ({
    label: String(y).slice(2) + "년",
    count: mine.filter((r) => r.closed_on?.slice(0, 4) === String(y)).length,
  }));

  // ── 업종 구성 (대체재까지 한눈에)
  const byCategory = MARKET_BIZ_TYPES.map((b) => ({
    key: b.key,
    label: b.label.replace(/\(.*\)/, "").trim(),
    count: inRadius.filter((r) => r.biz_type === b.key && r.is_open).length,
  }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);

  // ── 동별 밀집
  const emdMap = new Map<string, number>();
  for (const r of mineOpen) {
    const k = (r.emd || "").trim();
    if (!k) continue;
    emdMap.set(k, (emdMap.get(k) ?? 0) + 1);
  }
  const byDong = Array.from(emdMap, ([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // ── 규모(연면적) 분포
  const sized = mineOpen.filter((r) => r.gfa != null && (r.gfa as number) > 0);
  const bySize = SIZE_BANDS.map((b) => ({
    label: b.label,
    count: sized.filter((r) => (r.gfa as number) >= b.min && (r.gfa as number) < b.max).length,
  }));
  const gfaValues = sized.map((r) => r.gfa as number).sort((a, b) => a - b);
  const medianGfa = gfaValues.length ? Math.round(gfaValues[Math.floor(gfaValues.length / 2)]) : null;

  // ── 가까운 경쟁 목록
  const nearest = mine
    .slice()
    .sort((a, b) => a.km - b.km)
    .slice(0, 30)
    .map((r) => ({
      id: r.mgt_no,
      name: r.biz_name,
      category: r.ftype_name || r.svc_name,
      address: r.road_addr || r.lot_addr,
      distanceKm: Math.round(r.km * 100) / 100,
      gfa: r.gfa,
      isOpen: r.is_open,
      closedOn: r.closed_on,
    }));

  // 본인 센터(있다면)를 제외한 가장 가까운 경쟁
  const nearestRival = nearest.find((n) => n.isOpen && n.distanceKm > 0.02) ?? null;

  return NextResponse.json({
    ...meta,
    ready: true,
    center: { lat, lng, address: center.address, sido: center.sido, sigungu: center.sigungu },
    summary: {
      operating: mineOpen.length,
      within1km: withDist.filter((r) => r.biz_type === bizType && r.is_open && r.km <= 1).length,
      closed: closedCount,
      closureRate,
      closureFromYear,
      closureToYear,
      sigunguOpen,
      /** 반경 면적당 밀도 ÷ 시군구 밀도는 시군구 면적을 몰라 못 구한다 → 점유 비중으로 대체 */
      shareOfSigungu:
        sigunguOpen > 0 ? Math.round((mineOpen.length / sigunguOpen) * 1000) / 10 : 0,
      medianGfa,
      nearestRival,
    },
    byDistance,
    closureByYear,
    byCategory,
    byDong,
    bySize,
    nearest,
  });
}
