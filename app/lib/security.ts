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

// ============================================
// Rate Limiting (메모리 기반, Vercel Serverless)
// ============================================
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

// Vercel serverless는 인스턴스가 재활용되므로 일정 수준의 rate limiting 가능
const RATE_LIMIT_WINDOW = 60_000; // 1분
const RATE_LIMIT_MAX_WRITE = 30; // 쓰기 요청: 1분에 30회
const RATE_LIMIT_MAX_READ = 120; // 읽기 요청: 1분에 120회

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
  type: "read" | "write" = "write"
): NextResponse | null {
  const now = Date.now();
  const key = `${ip}:${type}`;
  const limit = type === "write" ? RATE_LIMIT_MAX_WRITE : RATE_LIMIT_MAX_READ;

  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return null;
  }

  entry.count++;
  if (entry.count > limit) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429 }
    );
  }

  return null;
}

// 오래된 엔트리 주기적 정리 (메모리 누수 방지)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetTime) {
      rateLimitMap.delete(key);
    }
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
