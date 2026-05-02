import { NextResponse } from "next/server";

// ============================================
// XSS 방어: HTML 태그 제거
// ============================================
export function sanitize(input: string): string {
  return input
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/** 객체의 모든 문자열 필드를 sanitize */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const result = { ...obj };
  for (const key of Object.keys(result)) {
    if (typeof result[key] === "string") {
      (result as Record<string, unknown>)[key] = sanitize(
        result[key] as string
      );
    }
  }
  return result;
}

/**
 * PostgREST `.or()` / `.ilike()` filter injection 방어.
 * 사용자 입력에서 PostgREST 문법을 깨거나 다른 조건을 inject 할 수 있는
 * 특수문자(쉼표·괄호·와일드카드·콜론)를 제거하고 길이 제한 적용.
 */
export function escapePostgrestQuery(q: string, maxLength = 100): string {
  return q
    .replace(/[,()*%:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

// ============================================
// Rate Limiting (메모리 + 슬라이딩 윈도우)
// ============================================
const rateLimitMap = new Map<string, number[]>();

const RATE_LIMIT_WINDOW = 60_000; // 1분
const RATE_LIMIT_MAX_WRITE = 20; // 쓰기: 1분에 20회
const RATE_LIMIT_MAX_READ = 100; // 읽기: 1분에 100회
const RATE_LIMIT_MAX_AUTH = 5; // 인증 시도: 1분에 5회

export function getClientIp(request: Request): string {
  const h = request.headers;
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

export function checkRateLimit(
  ip: string,
  type: "read" | "write" | "auth" = "write"
): NextResponse | null {
  const now = Date.now();
  const key = `${ip}:${type}`;
  const limit = type === "auth" ? RATE_LIMIT_MAX_AUTH : type === "write" ? RATE_LIMIT_MAX_WRITE : RATE_LIMIT_MAX_READ;

  // 슬라이딩 윈도우: 최근 1분 내 요청만 유지
  const timestamps = rateLimitMap.get(key) || [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW);

  if (recent.length >= limit) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429 }
    );
  }

  recent.push(now);
  rateLimitMap.set(key, recent);
  return null;
}

// 오래된 엔트리 주기적 정리
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of rateLimitMap) {
    const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW);
    if (recent.length === 0) rateLimitMap.delete(key);
    else rateLimitMap.set(key, recent);
  }
}, 60_000);

// ============================================
// 입력 검증
// ============================================
export function validateLength(
  value: string | undefined | null,
  maxLength: number
): string {
  if (!value) return "";
  return value.slice(0, maxLength);
}

/** 필수 문자열 필드 검증 */
export function requireField(
  value: string | undefined | null,
  fieldName: string,
  maxLength = 5000
): { valid: true; value: string } | { valid: false; error: NextResponse } {
  if (!value?.trim()) {
    return {
      valid: false,
      error: NextResponse.json(
        { error: `${fieldName}을(를) 입력해주세요` },
        { status: 400 }
      ),
    };
  }
  return { valid: true, value: value.trim().slice(0, maxLength) };
}

// ============================================
// Content-Type 검증
// ============================================
export function validateContentType(request: Request): NextResponse | null {
  const contentType = request.headers.get("content-type");
  if (request.method !== "GET" && !contentType?.includes("application/json")) {
    return NextResponse.json(
      { error: "Content-Type must be application/json" },
      { status: 400 }
    );
  }
  return null;
}

// ============================================
// 요청 크기 제한
// ============================================
export function checkPayloadSize(request: Request, maxBytes = 1_000_000): NextResponse | null {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > maxBytes) {
    return NextResponse.json(
      { error: "요청 크기가 너무 큽니다" },
      { status: 413 }
    );
  }
  return null;
}
