/**
 * 상권 동향(경쟁업체) 데이터 공용 모듈.
 *
 * 데이터 출처: **서울올림픽기념국민체육진흥공단_전국체육시설 정보** (공공데이터포털, 데이터셋 15113986)
 *   엔드포인트: apis.data.go.kr/B551014/SRVC_API_SFMS_FACI/TODZ_API_SFMS_FACI
 *
 * 이 출처를 고른 이유 (2026-09-14 실측):
 *   - 전국 153,382건. 체력단련장업·체육도장업·체육교습업 등 **민간 신고 시설 포함**
 *   - **WGS84 좌표(faci_lat/faci_lot)가 응답에 들어 있어 지오코딩이 불필요**
 *   - 폐업일(sdwn_ymd)·영업상태(faci_stat_nm) 제공
 *
 * 🚨 한계 — 반드시 사용자에게 알릴 것:
 *   1. **개업일 필드가 없다.** base_ymd 는 데이터 기준일이지 개설일이 아니다
 *      (표본 분포가 2019~2021 에 몰려 있고 2022년 이후가 거의 없음).
 *      → '신규'는 우리가 처음 관측한 시점(first_seen_at)으로만 판정할 수 있고, 과거 소급은 불가.
 *   2. 필라테스·요가는 체육시설법상 신고 업종이 아니라(자유업) 이 데이터에 잡히지 않는다.
 *      크로스핏은 보통 체력단련장업으로 등록된다.
 */

/* ─── 업종 분류 ─────────────────────────────────
 * 응답의 fcob_nm(업종명)을 내부 키로 접는다. 표시 순서도 이 배열 순서.
 * 수집은 전 업종을 다 저장하므로, UI 에서 업종만 바꾸면 즉시 다른 업종을 볼 수 있다.
 */
export interface MarketBizType {
  key: string;
  label: string;
  /** 이 키로 접을 fcob_nm(업종명) 값들 */
  match: string[];
  /** 기본 선택 업종 */
  primary?: boolean;
}

export const MARKET_BIZ_TYPES: MarketBizType[] = [
  { key: "gym", label: "헬스장(체력단련장업)", match: ["체력단련장업"], primary: true },
  { key: "dojang", label: "체육도장업(태권도·유도·복싱 등)", match: ["체육도장업"] },
  { key: "teaching", label: "체육교습업", match: ["체육교습업"] },
  { key: "virtual", label: "가상체험 체육시설업(스크린골프 등)", match: ["가상체험 체육시설업"] },
  { key: "golf", label: "골프연습장업", match: ["골프연습장업", "골프연습장"] },
  { key: "swim", label: "수영장업", match: ["수영장업", "수영장"] },
  { key: "billiard", label: "당구장업", match: ["당구장업"] },
  { key: "dance", label: "무도학원업·무도장업", match: ["무도학원업", "무도장업"] },
  { key: "etc", label: "기타 체육시설", match: [] },
];

export const PRIMARY_BIZ_TYPE =
  MARKET_BIZ_TYPES.find((b) => b.primary)?.key ?? MARKET_BIZ_TYPES[0].key;

const BIZ_BY_NAME = new Map<string, string>();
for (const b of MARKET_BIZ_TYPES) for (const m of b.match) BIZ_BY_NAME.set(m, b.key);

/** 업종명(fcob_nm) → 내부 키. 모르는 업종은 'etc'. */
export function bizTypeFromName(fcobNm: string): string {
  return BIZ_BY_NAME.get(String(fcobNm ?? "").trim()) ?? "etc";
}

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

/** "20240115" | "2024-01-15" → "2024-01-15" (빈 값·더미(1900년대)면 null) */
export function parseYmd(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const digits = s.replace(/\D/g, "");
  if (digits.length < 8) return null;
  const year = Number(digits.slice(0, 4));
  if (!Number.isFinite(year) || year < 1950 || year > 2100) return null; // 1900 같은 더미값 제거
  const ymd = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  // 원본에 2001-02-31 같은 달력에 없는 날짜가 섞여 있다 → 왕복 비교로 걸러낸다
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== ymd) return null;
  return ymd;
}

/** 주소 → { sido, sigungu }. 세종처럼 시군구가 없는 곳은 sigungu 빈 문자열. */
export function splitRegion(addr: string): { sido: string; sigungu: string } {
  const parts = String(addr ?? "").trim().split(/\s+/);
  return { sido: parts[0] ?? "", sigungu: parts[1] ?? "" };
}

/** 시도명 표기 흔들림 흡수 — "대구광역시" ↔ "대구" */
export function sidoAliases(sido: string): string[] {
  const s = String(sido ?? "").trim();
  if (!s) return [];
  const short = s.replace(/(특별자치시|특별자치도|광역시|특별시|자치도|도|시)$/, "");
  return Array.from(new Set([s, short].filter(Boolean)));
}

/* ─── 전국체육시설 API ──────────────────────────── */

const DEFAULT_ENDPOINT =
  "https://apis.data.go.kr/B551014/SRVC_API_SFMS_FACI/TODZ_API_SFMS_FACI";

export function facilityEndpoint(): string {
  return process.env.MARKET_API_URL || DEFAULT_ENDPOINT;
}

export interface RawFacility {
  faciCd: string;
  name: string;
  fcobNm: string;
  ftypeNm: string;
  faciGb: string;
  roadAddr: string;
  lotAddr: string;
  sido: string;
  sigungu: string;
  emd: string;
  gfa: number | null;
  lat: number | null;
  lng: number | null;
  stateName: string;
  closedOn: string | null;
  baseOn: string | null;
}

function str(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  return v == null ? "" : String(v).trim();
}

function num(row: Record<string, unknown>, key: string): number | null {
  const n = Number(str(row, key));
  return Number.isFinite(n) && n !== 0 ? n : null;
}

export function normalizeRow(row: Record<string, unknown>): RawFacility | null {
  const faciCd = str(row, "faci_cd");
  if (!faciCd) return null;
  return {
    faciCd,
    name: str(row, "faci_nm"),
    fcobNm: str(row, "fcob_nm"),
    ftypeNm: str(row, "ftype_nm"),
    faciGb: str(row, "faci_gb_nm"),
    roadAddr: str(row, "faci_road_addr"),
    lotAddr: str(row, "faci_addr"),
    sido: str(row, "addr_ctpv_nm"),
    sigungu: str(row, "addr_cpb_nm"),
    emd: str(row, "addr_emd_nm"),
    gfa: num(row, "faci_gfa"),
    lat: num(row, "faci_lat"),
    lng: num(row, "faci_lot"),
    stateName: str(row, "faci_stat_nm"),
    closedOn: parseYmd(str(row, "sdwn_ymd")),
    baseOn: parseYmd(str(row, "base_ymd")),
  };
}

/** 영업 중 판정 — 상태명이 '폐업'/'취소' 류이거나 폐업일이 있으면 false */
export function isOpenState(stateName: string, closedOn: string | null): boolean {
  if (closedOn) return false;
  const s = String(stateName ?? "");
  if (!s) return true;
  return !(s.includes("폐업") || s.includes("취소") || s.includes("말소") || s.includes("중지"));
}

export interface FetchPageResult {
  rows: RawFacility[];
  totalCount: number;
  diagnostics: {
    requestedUrl: string;
    httpStatus: number;
    rawCount: number;
    apiMessage?: string;
    sample?: unknown;
  };
}

function maskKey(url: string): string {
  return url.replace(/serviceKey=[^&]*/, "serviceKey=***");
}

/** 전국체육시설 한 페이지(최대 1000건) 조회. */
export async function fetchFacilityPage(opts: {
  serviceKey: string;
  pageNo: number;
  numOfRows: number;
}): Promise<FetchPageResult> {
  // serviceKey 는 포털의 Encoding 값을 그대로 붙인다(재인코딩 금지 — 공휴일 API 와 동일 규칙)
  const url =
    `${facilityEndpoint()}?serviceKey=${opts.serviceKey}` +
    `&pageNo=${opts.pageNo}&numOfRows=${Math.min(1000, opts.numOfRows)}&resultType=json`;

  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30000) });
  } catch (e) {
    return {
      rows: [],
      totalCount: 0,
      diagnostics: {
        requestedUrl: maskKey(url),
        httpStatus: 0,
        rawCount: 0,
        apiMessage: e instanceof Error ? e.message : "요청 실패",
      },
    };
  }

  const text = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {
      rows: [],
      totalCount: 0,
      diagnostics: {
        requestedUrl: maskKey(url),
        httpStatus: res.status,
        rawCount: 0,
        sample: text.slice(0, 400),
        apiMessage: /errMsg>([^<]+)</.exec(text)?.[1] ?? "JSON 응답이 아닙니다",
      },
    };
  }

  const body = ((json.response as Record<string, unknown>)?.body ?? {}) as Record<string, unknown>;
  const header = ((json.response as Record<string, unknown>)?.header ?? {}) as Record<string, unknown>;
  const itemsNode = (body.items ?? {}) as Record<string, unknown>;
  const rawItem = itemsNode.item ?? [];
  const raw = (Array.isArray(rawItem) ? rawItem : [rawItem]) as Record<string, unknown>[];
  const rows = raw.map(normalizeRow).filter((r): r is RawFacility => r !== null);

  return {
    rows,
    totalCount: Number(body.totalCount ?? 0) || 0,
    diagnostics: {
      requestedUrl: maskKey(url),
      httpStatus: res.status,
      rawCount: raw.length,
      apiMessage: rows.length === 0 ? String(header.resultMsg ?? "결과 없음") : undefined,
      sample: rows.length === 0 ? raw[0] ?? json : undefined,
    },
  };
}

/* ─── 카카오 로컬(센터 주소 지오코딩 전용) ───────── */

export interface GeoPoint {
  lat: number;
  lng: number;
}

/**
 * 주소 → WGS84 좌표. **센터 주소에만 쓴다**
 * (업소 좌표는 전국체육시설 API 응답에 이미 들어 있다).
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
