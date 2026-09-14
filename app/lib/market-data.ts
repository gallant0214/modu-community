/**
 * 상권 동향(경쟁업체) 데이터 공용 모듈.
 *
 * 데이터 출처: **행정안전부 생활 체력단련장업 조회서비스** (공공데이터포털 data.go.kr).
 *   - `인허가일자(apvPermYmd)` / `폐업일자(dcbYmd)` 가 있어 "언제 몇 개가 새로 생겼나"를 소급 분석할 수 있다.
 *   - 국민체육진흥공단 '전국체육시설' 데이터는 공공체육시설 위주 + 개업/폐업일이 없어 이 용도로 쓸 수 없다.
 *
 * 🚨 localdata.go.kr(LOCALDATA 포털)은 **2026-04-16 서비스 종료**되어 data.go.kr 로 이관됐다.
 *    이관된 서비스는 LOCALDATA 필드명(mgtNo/apvPermYmd/dcbYmd/...)을 그대로 쓰되
 *    인증은 data.go.kr 방식(serviceKey)이라, 기존 DATA_GO_KR_KEY 를 그대로 쓴다.
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
  /** 공공데이터포털 데이터셋 번호 (data.go.kr/data/<id>/openapi.do) — 활용신청 대상 */
  dataPk: string;
  /**
   * 요청 엔드포인트. 포털 '상세기능정보'에 표시되는 주소를 그대로 넣는다.
   * 환경변수 MARKET_API_URL_<KEY 대문자> 로 덮어쓸 수 있다(스펙이 다를 때 배포 없이 교정).
   */
  endpoint: string;
  /** 수집·표시 대상 여부 */
  enabled: boolean;
}

export const MARKET_BIZ_TYPES: MarketBizType[] = [
  {
    key: "gym",
    label: "헬스장(체력단련장업)",
    dataPk: "15155077",
    endpoint: "https://apis.data.go.kr/1741000/PhysicalTrainingBusiness/getPhysicalTrainingBusinessList",
    enabled: true,
  },
  {
    key: "complex",
    label: "종합체육시설업",
    dataPk: "15155071",
    endpoint: "https://apis.data.go.kr/1741000/ComplexSportsFacility/getComplexSportsFacilityList",
    enabled: false,
  },
  {
    key: "registered",
    label: "등록체육시설업(골프장·스키장 등)",
    dataPk: "15155018",
    endpoint: "https://apis.data.go.kr/1741000/RegisteredSportsFacility/getRegisteredSportsFacilityList",
    enabled: false,
  },
];

/** 카탈로그 기본 엔드포인트를 환경변수로 덮어쓴다 (예: MARKET_API_URL_GYM) */
export function endpointFor(biz: MarketBizType): string {
  return process.env[`MARKET_API_URL_${biz.key.toUpperCase()}`] || biz.endpoint;
}

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

/* ─── 인허가 데이터 API (data.go.kr) ───────────── */

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
  const mgtNo = pick(row, "mgtNo", "MGTNO", "mgtno", "관리번호");
  if (!mgtNo) return null;
  const closedOn = parseYmd(pick(row, "dcbYmd", "DCBYMD", "폐업일자"));
  return {
    mgtNo,
    bizName: pick(row, "bplcNm", "BPLCNM", "사업장명"),
    roadAddr: pick(row, "rdnWhlAddr", "RDNWHLADDR", "도로명전체주소"),
    lotAddr: pick(row, "siteWhlAddr", "SITEWHLADDR", "소재지전체주소"),
    openedOn: parseYmd(pick(row, "apvPermYmd", "APVPERMYMD", "인허가일자")),
    closedOn,
    stateName: pick(row, "trdStateNm", "TRDSTATENM", "영업상태명"),
    svcName: pick(row, "opnSvcNm", "OPNSVCNM", "개방서비스명"),
    upteName: pick(row, "uptaeNm", "UPTAENM", "업태구분명"),
    raw: row,
  };
}

/**
 * 응답 JSON 에서 행 배열을 찾아낸다.
 * data.go.kr 표준(response.body.items.item)과 LOCALDATA 유산(result.body.rows[0].row)을 모두 받는다.
 */
export function extractRows(json: unknown): Record<string, unknown>[] {
  const seen = new Set<unknown>();

  const walk = (node: unknown, depth: number): Record<string, unknown>[] | null => {
    if (!node || typeof node !== "object" || depth > 6 || seen.has(node)) return null;
    seen.add(node);

    if (Array.isArray(node)) {
      // 업소 행처럼 보이는 배열인가? (관리번호나 사업장명이 있는 객체들)
      const objs = node.filter((v) => v && typeof v === "object" && !Array.isArray(v));
      if (objs.length > 0) {
        const first = objs[0] as Record<string, unknown>;
        const looksLikeRow = ["mgtNo", "MGTNO", "bplcNm", "BPLCNM", "apvPermYmd", "관리번호", "사업장명"].some(
          (k) => k in first
        );
        if (looksLikeRow) return objs as Record<string, unknown>[];
      }
      for (const v of node) {
        const hit = walk(v, depth + 1);
        if (hit) return hit;
      }
      return null;
    }

    const obj = node as Record<string, unknown>;
    // 흔한 래핑 키를 우선 탐색
    for (const k of ["item", "items", "row", "rows", "body", "response", "result", "data"]) {
      if (k in obj) {
        const hit = walk(obj[k], depth + 1);
        if (hit) return hit;
      }
    }
    for (const v of Object.values(obj)) {
      const hit = walk(v, depth + 1);
      if (hit) return hit;
    }
    return null;
  };

  return walk(json, 0) ?? [];
}

export interface FetchPageResult {
  rows: RawFacility[];
  /** 진단용 — 인증키/엔드포인트가 맞는지 확인할 때 본다. */
  diagnostics: {
    requestedUrl: string;
    httpStatus: number;
    rawCount: number;
    sample?: unknown;
    /** 응답에 담긴 에러 메시지(있으면) */
    apiMessage?: string;
  };
}

/** data.go.kr 이 에러를 본문에 담아 200 으로 주는 경우가 많아 별도로 캐낸다. */
function apiMessageOf(json: unknown): string | undefined {
  const s = JSON.stringify(json ?? "");
  const m =
    /"(?:resultMsg|returnAuthMsg|errMsg|returnReasonCode|resultCode)"\s*:\s*"([^"]+)"/.exec(s) ??
    /<(?:resultMsg|returnAuthMsg|errMsg)>([^<]+)</.exec(s);
  return m?.[1];
}

/**
 * 인허가 업소 한 페이지 조회.
 * 페이지 파라미터는 서비스마다 pageNo/numOfRows 또는 pageIndex/pageSize 를 쓰므로 **양쪽 다** 보낸다.
 */
export async function fetchFacilityPage(opts: {
  serviceKey: string;
  endpoint: string;
  pageIndex: number;
  pageSize: number;
}): Promise<FetchPageResult> {
  // serviceKey 는 포털에서 받은 Encoding 값을 그대로 붙인다(재인코딩 금지 — 공휴일 API 와 동일 규칙)
  const extra = new URLSearchParams({
    pageNo: String(opts.pageIndex),
    numOfRows: String(opts.pageSize),
    pageIndex: String(opts.pageIndex),
    pageSize: String(opts.pageSize),
    type: "json",
    _type: "json",
    resultType: "json",
  });
  const url = `${opts.endpoint}?serviceKey=${opts.serviceKey}&${extra.toString()}`;

  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20000) });
  } catch (e) {
    return {
      rows: [],
      diagnostics: {
        requestedUrl: maskKey(url),
        httpStatus: 0,
        rawCount: 0,
        apiMessage: e instanceof Error ? e.message : "요청 실패",
      },
    };
  }

  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // XML/HTML 로 돌아오는 경우 — 앞부분을 그대로 진단에 담는다
    return {
      rows: [],
      diagnostics: {
        requestedUrl: maskKey(url),
        httpStatus: res.status,
        rawCount: 0,
        sample: text.slice(0, 400),
        apiMessage: apiMessageOf(text),
      },
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
      apiMessage: rows.length === 0 ? apiMessageOf(json) : undefined,
    },
  };
}

/** 로그·응답에 인증키가 노출되지 않게 가린다 */
function maskKey(url: string): string {
  return url.replace(/serviceKey=[^&]*/, "serviceKey=***");
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

export function marketKeysConfigured(): { dataGoKr: boolean; kakao: boolean } {
  return {
    dataGoKr: !!process.env.DATA_GO_KR_KEY,
    kakao: !!process.env.KAKAO_REST_API_KEY,
  };
}
