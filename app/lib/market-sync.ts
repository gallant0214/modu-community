/**
 * 상권 동향 데이터 수집 (전국체육시설 정보 API).
 *
 *  - `syncFacilities()`     : 전국 목록을 페이지 단위로 받아 **센터가 있는 시도**만 저장한다.
 *                             한 번에 다 못 돌면 페이지 커서를 남겨 다음 실행이 이어받는다.
 *  - `ensureCenterCoords()` : 센터 주소 → 좌표(반경 계산 기준점). 카카오 지오코딩 1회 후 캐시.
 *
 * 업소 좌표는 API 응답에 WGS84 로 들어 있어 별도 지오코딩이 필요 없다.
 */
import { supabase } from "@/app/lib/supabase";
import {
  bizTypeFromName,
  fetchFacilityPage,
  geocodeAddress,
  isOpenState,
  sidoAliases,
  splitRegion,
  type GeoPoint,
  type RawFacility,
} from "@/app/lib/market-data";

const PAGE_SIZE = 1000;
const SYNC_KEY = "kspo_faci";

export interface SyncReport {
  /** 이번 실행에서 조회한 페이지 범위 */
  fromPage: number;
  toPage: number;
  totalPages: number;
  /** API 로 받은 행 수 */
  fetched: number;
  /** 대상 지역이라 저장한 행 수 */
  stored: number;
  /** 신규로 처음 관측한 행 수 */
  added: number;
  totalCount: number;
  completed: boolean;
  regions: string[];
  diagnostics?: unknown;
  error?: string;
}

/** 저장 대상 지역(시도) — 등록된 센터들의 주소에서 뽑는다. */
async function targetSidos(): Promise<Set<string>> {
  const { data } = await supabase
    .from("crm_centers")
    .select("region_sido, address")
    .eq("status", "active");
  const out = new Set<string>();
  for (const c of (data ?? []) as { region_sido: string | null; address: string | null }[]) {
    const sido = (c.region_sido ?? "").trim() || splitRegion(c.address ?? "").sido;
    for (const alias of sidoAliases(sido)) out.add(alias);
  }
  return out;
}

/**
 * 전국체육시설 목록 동기화.
 * @param maxPages 이번 실행에서 처리할 최대 페이지 수 (함수 시간 제한 대비)
 * @param restart  true 면 페이지 커서를 1부터 다시 시작
 */
export async function syncFacilities(opts: {
  maxPages: number;
  restart?: boolean;
}): Promise<SyncReport> {
  const serviceKey = process.env.DATA_GO_KR_KEY;
  const report: SyncReport = {
    fromPage: 0,
    toPage: 0,
    totalPages: 0,
    fetched: 0,
    stored: 0,
    added: 0,
    totalCount: 0,
    completed: false,
    regions: [],
  };
  if (!serviceKey) {
    report.error = "DATA_GO_KR_KEY 가 설정되지 않았습니다";
    return report;
  }

  const sidos = await targetSidos();
  report.regions = Array.from(sidos);
  if (sidos.size === 0) {
    report.error = "센터 주소가 없어 수집 대상 지역을 정할 수 없습니다";
    return report;
  }

  const { data: stateRow } = await supabase
    .from("crm_market_sync_state")
    .select("last_page")
    .eq("biz_type", SYNC_KEY)
    .maybeSingle();
  const lastPage = opts.restart ? 0 : Number((stateRow as { last_page?: number } | null)?.last_page ?? 0);

  let page = lastPage + 1;
  report.fromPage = page;

  try {
    for (let i = 0; i < opts.maxPages; i++, page++) {
      const { rows, totalCount, diagnostics } = await fetchFacilityPage({
        serviceKey,
        pageNo: page,
        numOfRows: PAGE_SIZE,
      });
      if (i === 0) {
        report.diagnostics = diagnostics;
        report.totalCount = totalCount;
        report.totalPages = Math.ceil(totalCount / PAGE_SIZE);
      }
      report.toPage = page;
      if (rows.length === 0) {
        report.completed = true;
        break;
      }
      report.fetched += rows.length;

      const keep = rows.filter((r) => sidos.has(r.sido));
      if (keep.length > 0) {
        const { stored, added } = await upsertFacilities(keep);
        report.stored += stored;
        report.added += added;
      }
      if (rows.length < PAGE_SIZE) {
        report.completed = true;
        break;
      }
      if (report.totalPages > 0 && page >= report.totalPages) {
        report.completed = true;
        break;
      }
    }
  } catch (e) {
    report.error = e instanceof Error ? e.message : "수집 실패";
  }

  await supabase.from("crm_market_sync_state").upsert(
    {
      biz_type: SYNC_KEY,
      last_synced_at: new Date().toISOString(),
      synced_through: new Date().toISOString().slice(0, 10),
      last_page: report.completed ? 0 : report.toPage, // 한 바퀴 돌면 0 으로 리셋
      total_count: report.totalCount || null,
      last_result: {
        fetched: report.fetched,
        stored: report.stored,
        added: report.added,
        completed: report.completed,
      } as never,
    } as never,
    { onConflict: "biz_type" }
  );

  return report;
}

/**
 * 업서트. `first_seen_at` 은 payload 에 넣지 않는다
 * → 기존 행은 최초 관측 시점이 보존되고, 새 행만 now() 기본값을 받는다(= 신규 판정 근거).
 */
async function upsertFacilities(rows: RawFacility[]): Promise<{ stored: number; added: number }> {
  const ids = rows.map((r) => r.faciCd);
  const known = new Set<string>();
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await supabase
      .from("crm_market_facilities")
      .select("mgt_no")
      .in("mgt_no", ids.slice(i, i + 500));
    for (const r of (data ?? []) as { mgt_no: string }[]) known.add(r.mgt_no);
  }

  let stored = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200).map((r) => ({
      mgt_no: r.faciCd,
      source: "kspo",
      biz_type: bizTypeFromName(r.fcobNm),
      svc_name: r.fcobNm,
      ftype_name: r.ftypeNm,
      faci_gb: r.faciGb,
      biz_name: r.name,
      road_addr: r.roadAddr,
      lot_addr: r.lotAddr,
      sido: r.sido,
      sigungu: r.sigungu,
      emd: r.emd,
      gfa: r.gfa,
      lat: r.lat,
      lng: r.lng,
      geocode_state: r.lat != null && r.lng != null ? "ok" : "failed",
      opened_on: null, // 이 API 에는 개업일이 없다 (base_on 은 기준일일 뿐)
      base_on: r.baseOn,
      closed_on: r.closedOn,
      state_name: r.stateName,
      is_open: isOpenState(r.stateName, r.closedOn),
      synced_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from("crm_market_facilities")
      .upsert(chunk as never, { onConflict: "mgt_no" });
    if (!error) stored += chunk.length;
  }
  return { stored, added: ids.filter((id) => !known.has(id)).length };
}

/** 센터 좌표 — 이미 있으면 그대로, 없으면 주소를 지오코딩해 저장. */
export async function ensureCenterCoords(centerId: number): Promise<
  | { point: GeoPoint; sido: string; sigungu: string; address: string }
  | { point: null; sido: string; sigungu: string; address: string; reason: string }
> {
  const { data } = await supabase
    .from("crm_centers")
    .select("address, region_sido, region_sigungu, lat, lng")
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
