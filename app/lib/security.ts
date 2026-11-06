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
// Rate Limiting — 모든 서버 인스턴스가 공유하는 카운터(Upstash Redis)
// ============================================
// 🚨 예전엔 인스턴스 메모리(Map)에만 셌다. Vercel 은 서버를 여러 대로 늘리고 수시로 재시작하므로
//   '1분 5회'가 실제로는 '대수 × 5회'였고, 재시작 때마다 0 으로 돌아갔다(2026-11-06 이전).
//   Redis 가 없거나 응답이 늦으면(1.5초) 예전처럼 인스턴스 메모리로 센다 — 요청을 막지는 않는다.
const memoryCounters = new Map<string, number[]>();

const RATE_LIMIT_WINDOW = 60_000; // 1분
const RATE_LIMIT_MAX_WRITE = 20; // 쓰기: 1분에 20회
const RATE_LIMIT_MAX_READ = 100; // 읽기: 1분에 100회
const RATE_LIMIT_MAX_AUTH = 5; // 인증 시도: 1분에 5회
const SHARED_COUNTER_TIMEOUT_MS = 1500;

export function getClientIp(request: Request): string {
  const h = request.headers;
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

const TIMED_OUT = Symbol("timeout");
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((r) => {
    timer = setTimeout(() => r(TIMED_OUT), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/** 고정 1분 창 키 — 창이 바뀌면 새 키라 따로 지울 필요가 없다(EXPIRE 로 자동 소멸) */
function windowKey(name: string, windowMs: number): string {
  return `rl:${name}:${Math.floor(Date.now() / windowMs)}`;
}

/** 인스턴스 메모리 카운터(Redis 장애 시 폴백). add=false 면 세기만 한다 */
function memoryCount(name: string, windowMs: number, add: boolean): number {
  const now = Date.now();
  const recent = (memoryCounters.get(name) || []).filter((t) => now - t < windowMs);
  if (add) recent.push(now);
  memoryCounters.set(name, recent);
  return recent.length;
}

/** 공유 카운터 +1 후 이번 창의 누적 수. Redis 실패 시 메모리 */
async function sharedIncr(name: string, windowMs: number): Promise<number> {
  try {
    // 동적 import — 빌드/클라이언트 번들에 끌려 들어가지 않게
    const { getRedis } = await import("./cache");
    const redis = getRedis();
    if (redis) {
      const key = windowKey(name, windowMs);
      const res = await withTimeout(
        redis.pipeline().incr(key).expire(key, Math.ceil(windowMs / 1000) + 5).exec<[number, number]>(),
        SHARED_COUNTER_TIMEOUT_MS
      );
      if (res !== TIMED_OUT && Array.isArray(res) && typeof res[0] === "number") return res[0];
    }
  } catch {
    /* 폴백 */
  }
  return memoryCount(name, windowMs, true);
}

/** 공유 카운터 현재 값(증가 없음). Redis 실패·지연 시 메모리 */
async function sharedGet(name: string, windowMs: number): Promise<number> {
  try {
    const { getRedis } = await import("./cache");
    const redis = getRedis();
    if (redis) {
      const v = await withTimeout(redis.get<number>(windowKey(name, windowMs)), SHARED_COUNTER_TIMEOUT_MS);
      if (v !== TIMED_OUT) return Number(v) || 0; // null = 이번 창에 아직 없음 = 0
    }
  } catch {
    /* 폴백 */
  }
  return memoryCount(name, windowMs, false);
}

/**
 * 요청 횟수 제한 (IP + 종류별, 1분 창). 넘으면 429 응답, 아니면 null.
 * 🚨 async — 반드시 `await checkRateLimit(...)`. await 를 빼면 Promise 가 truthy 라 항상 응답이 끊긴다.
 */
export async function checkRateLimit(
  ip: string,
  type: "read" | "write" | "auth" = "write"
): Promise<NextResponse | null> {
  const limit = type === "auth" ? RATE_LIMIT_MAX_AUTH : type === "write" ? RATE_LIMIT_MAX_WRITE : RATE_LIMIT_MAX_READ;
  const count = await sharedIncr(`${type}:${ip}`, RATE_LIMIT_WINDOW);
  if (count > limit) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429 }
    );
  }
  return null;
}

/**
 * 인증 '실패' 횟수 (비밀번호 대입 방어용). 성공한 요청은 세지 않는다 —
 * 관리자 화면처럼 한 번에 API 를 여러 개 부르는 곳이 정상 사용 중에 막히지 않게.
 */
export async function authFailureCount(scope: string, ip: string): Promise<number> {
  return sharedGet(`fail:${scope}:${ip}`, RATE_LIMIT_WINDOW);
}
export async function recordAuthFailure(scope: string, ip: string): Promise<void> {
  await sharedIncr(`fail:${scope}:${ip}`, RATE_LIMIT_WINDOW);
}

// 오래된 엔트리 주기적 정리
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of memoryCounters) {
    const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW);
    if (recent.length === 0) memoryCounters.delete(key);
    else memoryCounters.set(key, recent);
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
