import { NextRequest, NextResponse } from "next/server";

/**
 * Edge 프록시 (구 middleware): 글로벌 보안 헤더 + 기본 rate limit
 *
 * Next.js 16에서 middleware.ts → proxy.ts로 파일명이 변경됨.
 *
 * 목적
 * - 서버리스 인스턴스마다 메모리가 분리되어 완벽한 rate limit은 아니지만,
 *   단일 인스턴스를 대상으로 한 캐주얼 공격은 차단한다.
 * - 실질적인 Layer-7 DDoS 방어는 Vercel Firewall(Attack Challenge Mode)을
 *   대시보드에서 활성화해야 완전해진다.
 * - 이 프록시는 API 경로의 mutating 호출(POST/PUT/DELETE/PATCH)만 대상으로
 *   한다. GET/정적 리소스는 캐시에 의존하므로 생략.
 */

type Bucket = { count: number; reset: number };
const buckets = new Map<string, Bucket>();

const WINDOW_MS = 60_000;
// 경로별 분당 허용 요청 (IP + 경로 기준)
const LIMITS: Array<{ match: RegExp; limit: number }> = [
  // 인증/민감 엔드포인트: 1분에 10회
  { match: /^\/api\/auth\//, limit: 10 },
  { match: /^\/api\/admin\//, limit: 20 },
  // 쓰기/댓글/신고/북마크: 1분에 30회
  { match: /^\/api\/posts\//, limit: 30 },
  { match: /^\/api\/post\//, limit: 30 },
  { match: /^\/api\/comments\//, limit: 30 },
  { match: /^\/api\/jobs\//, limit: 30 },
  { match: /^\/api\/bookmarks/, limit: 30 },
  { match: /^\/api\/reports/, limit: 20 },
  { match: /^\/api\/inquiries\//, limit: 20 },
  { match: /^\/api\/notifications\//, limit: 60 },
  // 기본 API 폴백
  { match: /^\/api\//, limit: 60 },
];

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function findLimit(pathname: string): number {
  for (const { match, limit } of LIMITS) {
    if (match.test(pathname)) return limit;
  }
  return 0;
}

function checkBucket(key: string, limit: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.reset) {
    buckets.set(key, { count: 1, reset: now + WINDOW_MS });
    return true;
  }
  if (b.count >= limit) return false;
  b.count += 1;
  return true;
}

// 주기적 정리 (인스턴스 메모리 누수 방지)
let lastSweep = 0;
function sweep() {
  const now = Date.now();
  if (now - lastSweep < WINDOW_MS) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    if (now > b.reset) buckets.delete(key);
  }
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const res = NextResponse.next();

  // 보안 헤더 (next.config와 중복되어도 프록시가 먼저 적용됨)
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  );
  res.headers.set("X-DNS-Prefetch-Control", "off");

  // API mutating 경로만 rate limit (GET은 캐시에 의존하므로 제외)
  if (
    pathname.startsWith("/api/") &&
    req.method !== "GET" &&
    req.method !== "HEAD" &&
    req.method !== "OPTIONS"
  ) {
    const limit = findLimit(pathname);
    if (limit > 0) {
      sweep();
      const ip = getClientIp(req);
      const key = `${ip}:${pathname}:${req.method}`;
      if (!checkBucket(key, limit)) {
        return new NextResponse(
          JSON.stringify({
            error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": "60",
              "X-Content-Type-Options": "nosniff",
            },
          },
        );
      }
    }
  }

  return res;
}

export const proxyConfig = {
  // Next 정적 자산과 _next 내부 경로는 제외
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)",
  ],
};
