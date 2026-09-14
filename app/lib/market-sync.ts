/**
 * 상권 동향 데이터 수집.
 *  - `syncFacilities()`  : LOCALDATA 인허가 데이터를 받아 crm_market_facilities 에 누적(업서트)
 *  - `geocodePending()`  : 좌표가 없는 업소를 카카오 로컬 API 로 지오코딩
 *  - `ensureCenterCoords()` : 센터 주소 → 좌표(반경 계산의 기준점). 결과는 crm_centers 에 캐시.
 *
 * 수동 실행(`POST /api/crm/market/sync`)과 주간 크론(`/api/cron/market-sync`)이 같은 함수를 쓴다.
 */
import { supabase } from "@/app/lib/supabase";
import {
  ENABLED_BIZ_TYPES,
  endpointFor,
  fetchFacilityPage,
  geocodeAddress,
  isOpenState,
  splitRegion,
  type GeoPoint,
  type RawFacility,
} from "@/app/lib/market-data";

/** 한 번에 받아올 페이지 크기 */
const PAGE_SIZE = 500;

export interface SyncReport {
  bizType: string;
  fetched: number;
  upserted: number;
  pages: number;
  /** 인증키·서비스ID 확인용 — 첫 페이지 진단 */
  receivedSvcName?: string;
  diagnostics?: unknown;
  error?: string;
}

/**
 * 인허가일자 기준 최근 `months` 개월분을 받아 업서트한다.
 * 좌표(lat/lng)·지오코딩 상태는 payload 에 넣지 않는다 → 재동기화해도 기존 좌표가 지워지지 않는다.
 */
export async function syncFacilities(opts: {
  months: number;
  /** 업종당 최대 페이지 수(폭주 방지) */
  maxPages: number;
}): Promise<SyncReport[]> {
  const serviceKey = process.env.DATA_GO_KR_KEY;
  if (!serviceKey) {
    return ENABLED_BIZ_TYPES.map((b) => ({
      bizType: b.key,
      fetched: 0,
      upserted: 0,
      pages: 0,
      error: "DATA_GO_KR_KEY 가 설정되지 않았습니다",
    }));
  }

  // 응답에 인허가일자 범위 필터가 없는 서비스가 있어, 받아온 뒤 이 기준일로 걸러 저장한다.
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - Math.max(1, opts.months));
  const cutoffYmd = cutoff.toISOString().slice(0, 10);

  const reports: SyncReport[] = [];

  for (const biz of ENABLED_BIZ_TYPES) {
    const report: SyncReport = { bizType: biz.key, fetched: 0, upserted: 0, pages: 0 };
    try {
      for (let page = 1; page <= opts.maxPages; page++) {
        const { rows, diagnostics } = await fetchFacilityPage({
          serviceKey,
          endpoint: endpointFor(biz),
          pageIndex: page,
          pageSize: PAGE_SIZE,
        });
        if (page === 1) {
          report.diagnostics = diagnostics;
          report.receivedSvcName = rows[0]?.svcName;
        }
        report.pages = page;
        if (rows.length === 0) break;
        report.fetched += rows.length;
        // 인허가일이 기준일보다 오래된 건은 저장하지 않는다(개업일 없는 행은 남겨 둔다)
        const keep = rows.filter((r) => !r.openedOn || r.openedOn >= cutoffYmd);
        report.upserted += await upsertFacilities(biz.key, keep);
        if (rows.length < PAGE_SIZE) break;
      }

      await supabase.from("crm_market_sync_state").upsert(
        {
          biz_type: biz.key,
          last_synced_at: new Date().toISOString(),
          synced_through: new Date().toISOString().slice(0, 10),
          last_result: { fetched: report.fetched, upserted: report.upserted } as never,
        } as never,
        { onConflict: "biz_type" }
      );
    } catch (e) {
      report.error = e instanceof Error ? e.message : "수집 실패";
    }
    reports.push(report);
  }
  return reports;
}

async function upsertFacilities(bizType: string, rows: RawFacility[]): Promise<number> {
  let done = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200).map((r) => {
      const addr = r.roadAddr || r.lotAddr;
      const { sido, sigungu } = splitRegion(addr);
      return {
        mgt_no: r.mgtNo,
        biz_type: bizType,
        svc_name: r.svcName,
        upte_name: r.upteName,
        biz_name: r.bizName,
        road_addr: r.roadAddr,
        lot_addr: r.lotAddr,
        sido,
        sigungu,
        opened_on: r.openedOn,
        closed_on: r.closedOn,
        state_name: r.stateName,
        is_open: isOpenState(r.stateName, r.closedOn),
        raw: r.raw,
        synced_at: new Date().toISOString(),
      };
    });
    const { error } = await supabase
      .from("crm_market_facilities")
      .upsert(chunk as never, { onConflict: "mgt_no" });
    if (!error) done += chunk.length;
  }
  return done;
}

/**
 * 좌표 미확보 업소를 지오코딩한다.
 * 센터와 같은 시군구를 먼저 처리하고(반경 분석에 바로 쓰이므로), 남은 여유로 같은 시도를 채운다.
 */
export async function geocodePending(opts: {
  sido?: string;
  sigungu?: string;
  limit: number;
}): Promise<{ ok: number; failed: number; skipped: boolean }> {
  if (!process.env.KAKAO_REST_API_KEY) return { ok: 0, failed: 0, skipped: true };

  const targets: { mgt_no: string; road_addr: string | null; lot_addr: string | null }[] = [];

  const take = async (filter: { sido?: string; sigungu?: string }, limit: number) => {
    if (limit <= 0) return;
    let q = supabase
      .from("crm_market_facilities")
      .select("mgt_no, road_addr, lot_addr")
      .eq("geocode_state", "pending");
    if (filter.sido) q = q.eq("sido", filter.sido);
    if (filter.sigungu) q = q.eq("sigungu", filter.sigungu);
    const { data } = await q.limit(limit);
    for (const row of (data ?? []) as typeof targets) {
      if (!targets.some((t) => t.mgt_no === row.mgt_no)) targets.push(row);
    }
  };

  if (opts.sido && opts.sigungu) await take({ sido: opts.sido, sigungu: opts.sigungu }, opts.limit);
  if (targets.length < opts.limit && opts.sido) await take({ sido: opts.sido }, opts.limit - targets.length);
  if (targets.length < opts.limit) await take({}, opts.limit - targets.length);

  let ok = 0;
  let failed = 0;
  for (const t of targets.slice(0, opts.limit)) {
    const point = await geocodeAddress([t.road_addr ?? "", t.lot_addr ?? ""]);
    if (point) {
      ok += 1;
      await supabase
        .from("crm_market_facilities")
        .update({ lat: point.lat, lng: point.lng, geocode_state: "ok" } as never)
        .eq("mgt_no", t.mgt_no);
    } else {
      failed += 1;
      await supabase
        .from("crm_market_facilities")
        .update({ geocode_state: "failed" } as never)
        .eq("mgt_no", t.mgt_no);
    }
  }
  return { ok, failed, skipped: false };
}

/** 센터 좌표 — 이미 있으면 그대로, 없으면 주소를 지오코딩해 저장. */
export async function ensureCenterCoords(centerId: number): Promise<
  | { point: GeoPoint; sido: string; sigungu: string; address: string }
  | { point: null; sido: string; sigungu: string; address: string; reason: string }
> {
  const { data } = await supabase
    .from("crm_centers")
    .select("address, address_detail, region_sido, region_sigungu, lat, lng")
    .eq("id", centerId)
    .maybeSingle();
  const c = (data ?? {}) as {
    address?: string | null;
    region_sido?: string | null;
    region_sigungu?: string | null;
    lat?: number | null;
    lng?: number | null;
  };
  const address = (c.address ?? "").trim();
  const fromAddr = splitRegion(address);
  const sido = (c.region_sido ?? "").trim() || fromAddr.sido;
  const sigungu = (c.region_sigungu ?? "").trim() || fromAddr.sigungu;

  if (c.lat != null && c.lng != null) {
    return { point: { lat: c.lat, lng: c.lng }, sido, sigungu, address };
  }
  if (!address) {
    return { point: null, sido, sigungu, address, reason: "센터 주소가 등록되어 있지 않습니다" };
  }
  if (!process.env.KAKAO_REST_API_KEY) {
    return { point: null, sido, sigungu, address, reason: "KAKAO_REST_API_KEY 가 설정되지 않았습니다" };
  }
  const point = await geocodeAddress([address]);
  if (!point) {
    return { point: null, sido, sigungu, address, reason: "센터 주소를 좌표로 변환하지 못했습니다" };
  }
  await supabase
    .from("crm_centers")
    .update({ lat: point.lat, lng: point.lng, geocoded_at: new Date().toISOString() } as never)
    .eq("id", centerId);
  return { point, sido, sigungu, address };
}
