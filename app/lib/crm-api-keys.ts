/**
 * 외부 연동 API 키(조회 전용) — 화면·서버 공용 상수와 순수 함수.
 * 키 발급·검증(서버 전용)은 crm-api-key-auth.ts.
 *
 * 사용자 결정(2026-11-14): 엑셀·구글 시트·자동화 도구용, **조회만**, 데이터 = 회원·이용권 + 매출·결제.
 */

export const API_KEY_PREFIX = "mcm_";
/** 접두어 뒤 임의 문자 수 (base62 32자 ≈ 190비트) */
export const API_KEY_RANDOM_LEN = 32;
const API_KEY_RE = /^mcm_[A-Za-z0-9]{32}$/;
/** 센터당 동시에 쓸 수 있는 키 수 */
export const API_KEY_MAX_ACTIVE = 10;
export const API_KEY_NAME_MAX = 40;

export type ApiKeyScope = "members" | "sales";

/**
 * 키로 볼 수 있는 데이터 묶음.
 * permission = 그 데이터를 엑셀로 내보낼 수 있는 직급권한 — 키를 만들 때와 쓸 때 모두 키 만든 직원에게 있어야 한다
 * (엑셀 내보내기가 꺼진 직원이 키로 우회하지 못하게).
 */
export const API_KEY_SCOPES: { key: ApiKeyScope; label: string; desc: string; permission: string }[] = [
  { key: "members", label: "회원·이용권", desc: "회원 목록, 회원권·수강권 (이름·연락처 포함)", permission: "members.excel" },
  { key: "sales", label: "매출·결제", desc: "기간별 결제 내역, 월별 매출 합계", permission: "sales.excel" },
];

export function isApiKeyScope(v: unknown): v is ApiKeyScope {
  return v === "members" || v === "sales";
}

export function apiKeyScopeLabel(scope: string): string {
  return API_KEY_SCOPES.find((s) => s.key === scope)?.label ?? scope;
}

export function isApiKeyFormat(raw: string): boolean {
  return API_KEY_RE.test(raw);
}

/** 목록에 보여 줄 앞부분 (접두어 + 8자) — 이것만으로는 인증할 수 없다 */
export function apiKeyDisplayPrefix(raw: string): string {
  return raw.slice(0, API_KEY_PREFIX.length + 8);
}

/**
 * 요청에서 키 꺼내기 — 우선순위: Authorization: Bearer > X-API-Key 헤더 > ?key= 쿼리.
 * 쿼리는 구글 시트 IMPORTDATA·엑셀 '웹에서'처럼 헤더를 못 넣는 도구용.
 */
export function extractApiKey(headers: { get(name: string): string | null }, url: string): string | null {
  const auth = headers.get("authorization");
  if (auth) {
    const m = auth.match(/^Bearer\s+(\S+)$/i);
    if (m && m[1].startsWith(API_KEY_PREFIX)) return m[1];
  }
  const x = headers.get("x-api-key")?.trim();
  if (x) return x;
  try {
    const q = new URL(url).searchParams.get("key")?.trim();
    if (q) return q;
  } catch {
    /* 잘못된 URL */
  }
  return null;
}

/* ── CSV ───────────────────────────────────────────────── */

export type CsvColumn<T> = { key: keyof T & string; label: string };

/**
 * CSV 한 칸. 숫자는 그대로, 글자는 따옴표로 감싼다.
 * 🚨 =·+·@ 로 시작하는 글자(또는 숫자가 아닌 -로 시작)는 엑셀·시트가 수식으로 실행하므로 앞에 ' 를 붙인다.
 */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "boolean") return v ? "Y" : "N";
  let s = String(v);
  if (/^[=+@\t\r]/.test(s) || (/^-/.test(s) && !/^-\d+(\.\d+)?$/.test(s))) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** 머리글(한글) + 행. 엑셀이 한글을 깨뜨리지 않게 BOM 을 붙인다(회원 목록 엑셀 받기와 같은 방식). */
export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const head = columns.map((c) => csvCell(c.label)).join(",");
  const body = rows.map((r) => columns.map((c) => csvCell(r[c.key])).join(","));
  return "﻿" + [head, ...body].join("\r\n");
}

/* ── 안내용 주소 목록 (설정 화면 사용 방법) ─────────────────── */

export const OPEN_API_ENDPOINTS: {
  path: string;
  scope: ApiKeyScope | null;
  label: string;
  desc: string;
  example?: string;
}[] = [
  { path: "/api/open/v1", scope: null, label: "연결 확인", desc: "키가 맞는지, 어떤 데이터를 볼 수 있는지" },
  { path: "/api/open/v1/members", scope: "members", label: "회원 목록", desc: "상태·이용 중 상품·만료일·남은 횟수·최근 출석·누적 결제" },
  { path: "/api/open/v1/memberships", scope: "members", label: "회원권 목록", desc: "회원권별 시작·만료일, 상태, 금액 — ?only=active 면 이용 중·예정만" },
  { path: "/api/open/v1/passes", scope: "members", label: "수강권 목록", desc: "수강권별 총·남은 횟수, 담당 강사, 만료일 — ?only=active 면 이용 중·예정만" },
  { path: "/api/open/v1/sales", scope: "sales", label: "결제 내역", desc: "기간 결제 한 건씩 (통계 매출 리스트와 같은 값)", example: "?from=2026-11-01&to=2026-11-30" },
  { path: "/api/open/v1/sales/monthly", scope: "sales", label: "월별 매출", desc: "달마다 합계와 회원권·수강권·운동복·락커·기타", example: "?from=2026-01&to=2026-12" },
];
