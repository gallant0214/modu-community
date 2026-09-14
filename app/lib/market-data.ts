/**
 * 상권 동향(경쟁업체) 데이터 공용 모듈.
 *
 * 데이터 출처: **행정안전부 지방행정 인허가 데이터(LOCALDATA)** 체육시설업.
 *   - `인허가일자(apvPermYmd)` / `폐업일자(dcbYmd)` 가 있어 "언제 몇 개가 새로 생겼나"를 소급 분석할 수 있다.
 *   - 국민체육진흥공단 '전국체육시설' 데이터는 공공체육시설 위주 + 개업/폐업일이 없어 이 용도로 쓸 수 없다.
 *
 * ⚠️ 한계(사용자 안내 필수): 소규모 PT샵·필라테스는 체육시설업 신고 없이 자유업으로 등록되는 경우가 있어
 *    집계값은 **최소치**다. 인허가일과 실제 개업일 사이에도 시차가 있을 수 있다.
 */

/* ─── 업종 카탈로그 ─────────────────────────────────
 * 지금은 헬스장(gym)만 수집·표시한다. 다른 업종은 `enabled: true` 로 바꾸면
 * 수집·필터·집계가 그대로 따라붙도록 전 구간을 카탈로그 기준으로 짰다.
 *
 * ⚠️ opnSvcId 는 LOCALDATA '개방서비스 목록' 기준 값이다. 인증키 발급 후 첫 동기화 때
 *    응답의 opnSvcNm(개방서비스명)이 label 과 일치하는지 반드시 확인할 것.
 *    (sync 라우트가 응답에 receivedSvcName 으로 실제 값을 되돌려준다)
 */
export interface MarketBizType {
  key: string;
  label: string;
  /** LOCALDATA 개방서비스 ID */
  opnSvcId: string;
  /** 수집·표시 대상 여부 */
  enabled: boolean;
}

export const MARKET_BIZ_TYPES: MarketBizType[] = [
  { key: "gym", label: "헬스장(체력단련장업)", opnSvcId: "07_24_04_P", enabled: true },
  { key: "dojang", label: "체육도장업(요가·필라테스·복싱 등)", opnSvcId: "07_24_05_P", enabled: false },
  { key: "swim", label: "수영장업", opnSvcId: "07_24_03_P", enabled: false },
  { key: "golf", label: "골프연습장업", opnSvcId: "07_24_02_P", enabled: false },
  { key: "complex", label: "종합체육시설업", opnSvcId: "07_24_01_P", enabled: false },
];

export const ENABLED_BIZ_TYPES = MARKET_BIZ_TYPES.filter((b) => b.enabled);

export function bizTypeOf(key: string): MarketBizType | undefined {
  return MARKET_BIZ_TYPES.find((b) => b.key === key);
}

/* ─── 거리 ─────────────────────────────────────── */

/** 두 좌표 사이 거리(km) — 하버사인 */
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/* ─── 값 정규화 ────────────────────────────────── */

/** "20240115" | "2024-01-15" → "2024-01-15" (빈 값이면 null) */
export function parseYmd(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const digits = s.replace(/\D/g, "");
  if (digits.length < 8) return null;
  const ymd = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null;
}

/** 주소 → { sido, sigungu }. 세종처럼 시군구가 없는 곳은 sigungu 빈 문자열. */
export function splitRegion(addr: string): { sido: string; sigungu: string } {
  const parts = String(addr ?? "").trim().split(/\s+/);
  return { sido: parts[0] ?? "", sigungu: parts[1] ?? "" };
}

/**
 * 영업상태 판정. LOCALDATA 는 폐업일자(dcbYmd)와 영업상태명(trdStateNm)을 함께 주는데
 * 둘 중 하나만 채워진 행이 있어 양쪽을 모두 본다.
 */
export function isOpenState(stateName: string | null, closedOn: string | null): boolean {
  if (closedOn) return false;
  const s = String(stateName ?? "");
  return !(s.includes("폐업") || s.includes("취소") || s.includes("말소"));
}

/* ─── LOCALDATA API ────────────────────────────── */

const LOCALDATA_BASE = "https://www.localdata.go.kr/platform/rest/TO0/openDataApi";

export interface RawFacility {
  mgtNo: string;
  bizName: string;
  roadAddr: string;
  lotAddr: string;
  openedOn: string | null;
  closedOn: string | null;
  stateName: string;
  svcName: string;
  upteName: string;
  raw: Record<string, unknown>;
}

/** 응답 행의 필드명이 조금씩 다른 경우가 있어 후보를 순서대로 훑는다. */
function pick(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

export function normalizeRow(row: Record<string, unknown>): RawFacility | null {
  const mgtNo = pick(row, "mgtNo", "MGTNO", "mgtno");
  if (!mgtNo) return null;
  const closedOn = parseYmd(pick(row, "dcbYmd", "DCBYMD"));
  return {
    mgtNo,
    bizName: pick(row, "bplcNm", "BPLCNM"),
    roadAddr: pick(row, "rdnWhlAddr", "RDNWHLADDR"),
    lotAddr: pick(row, "siteWhlAddr", "SITEWHLADDR"),
    openedOn: parseYmd(pick(row, "apvPermYmd", "APVPERMYMD")),
    closedOn,
    stateName: pick(row, "trdStateNm", "TRDSTATENM"),
    svcName: pick(row, "opnSvcNm", "OPNSVCNM"),
    upteName: pick(row, "uptaeNm", "UPTAENM"),
    raw: row,
  };
}

/** 응답 JSON 에서 행 배열을 찾아낸다(LOCALDATA 응답 래핑이 문서마다 조금 다름). */
function extractRows(json: unknown): Record<string, unknown>[] {
  const j = json as Record<string, unknown> | null;
  if (!j) return [];
  const result = (j.result ?? j) as Record<string, unknown>;
  const body = (result?.body ?? result) as Record<string, unknown>;
  const rows = (body?.rows ?? body?.row ?? body?.items) as unknown;
  if (Array.isArray(rows)) {
    // [{ row: [...] }] 형태로 한 번 더 감싸진 경우
    if (rows.length > 0 && !Array.isArray(rows[0]) && (rows[0] as Record<string, unknown>)?.row) {
      const inner = (rows[0] as Record<string, unknown>).row;
      return Array.isArray(inner) ? (inner as Record<string, unknown>[]) : [];
    }
    return rows as Record<string, unknown>[];
  }
  return [];
}

export interface FetchPageResult {
  rows: RawFacility[];
  /** 진단용 — 인증키/서비스ID 가 맞는지 확인할 때 본다. */
  diagnostics: { requestedUrl: string; httpStatus: number; rawCount: number; sample?: unknown };
}

/**
 * LOCALDATA 한 페이지 조회.
 * @param bgnYmd/endYmd 인허가일자 범위 (YYYYMMDD)
 */
export async function fetchLocaldataPage(opts: {
  authKey: string;
  opnSvcId: string;
  pageIndex: number;
  pageSize: number;
  bgnYmd: string;
  endYmd: string;
}): Promise<FetchPageResult> {
  const params = new URLSearchParams({
    authKey: opts.authKey,
    opnSvcId: opts.opnSvcId,
    pageIndex: String(opts.pageIndex),
    pageSize: String(opts.pageSize),
    resultType: "json",
    bgnYmd: opts.bgnYmd,
    endYmd: opts.endYmd,
  });
  const url = `${LOCALDATA_BASE}?${params.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // JSON 이 아니면(에러 HTML 등) 진단에 앞부분만 담는다
    return {
      rows: [],
      diagnostics: { requestedUrl: maskKey(url), httpStatus: res.status, rawCount: 0, sample: text.slice(0, 300) },
    };
  }
  const raw = extractRows(json);
  const rows = raw.map(normalizeRow).filter((r): r is RawFacility => r !== null);
  return {
    rows,
    diagnostics: {
      requestedUrl: maskKey(url),
      httpStatus: res.status,
      rawCount: raw.length,
      sample: raw[0] ?? json,
    },
  };
}

/** 로그·응답에 인증키가 노출되지 않게 가린다 */
function maskKey(url: string): string {
  return url.replace(/authKey=[^&]*/, "authKey=***");
}

/* ─── 카카오 로컬(지오코딩) ─────────────────────── */

export interface GeoPoint {
  lat: number;
  lng: number;
}

/**
 * 주소 → WGS84 좌표. 도로명 주소로 먼저 시도하고 실패하면 지번 주소로 재시도한다.
 * 키가 없거나 둘 다 실패하면 null.
 */
export async function geocodeAddress(addresses: string[]): Promise<GeoPoint | null> {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) return null;
  for (const addr of addresses) {
    const q = String(addr ?? "").trim();
    if (!q) continue;
    try {
      const res = await fetch(
        `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(q)}&size=1`,
        { headers: { Authorization: `KakaoAK ${key}` }, cache: "no-store" }
      );
      if (!res.ok) continue;
      const json = (await res.json()) as { documents?: { x?: string; y?: string }[] };
      const doc = json.documents?.[0];
      const lng = Number(doc?.x);
      const lat = Number(doc?.y);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    } catch {
      /* 다음 주소로 */
    }
  }
  return null;
}

export function marketKeysConfigured(): { localdata: boolean; kakao: boolean } {
  return {
    localdata: !!process.env.LOCALDATA_API_KEY,
    kakao: !!process.env.KAKAO_REST_API_KEY,
  };
}
