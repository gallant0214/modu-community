/**
 * Upstash Redis 캐시 유틸리티
 *
 * UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN 이 설정돼 있으면
 * Redis 캐시를 사용하고, 없으면 캐시 없이 원본 데이터를 직접 반환 (graceful fallback).
 */

let redis: import("@upstash/redis").Redis | null = null;

function getRedis() {
  if (redis) return redis;
  // Vercel Marketplace는 KV_REST_API_*, 수동 설치는 UPSTASH_REDIS_REST_* 사용
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  // 동적 import 회피: 빌드 타임에 env 없어도 깨지지 않도록
  const { Redis } = require("@upstash/redis") as typeof import("@upstash/redis");
  redis = new Redis({ url, token });
  return redis;
}

/**
 * 캐시 우선 조회. 캐시 miss 시 fetcher() 실행 후 캐시에 저장.
 *
 * @param key   Redis 키 (예: "posts:category:3:page:1")
 * @param ttl   캐시 TTL (초)
 * @param fetcher  캐시 miss 시 실제 데이터를 가져오는 함수
 */
export async function cached<T>(
  key: string,
  ttl: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const r = getRedis();
  if (!r) return fetcher(); // Redis 미설정 → 캐시 없이 직접 조회

  try {
    const hit = await r.get<T>(key);
    if (hit !== null && hit !== undefined) return hit;
  } catch {
    // Redis 에러 → fallback
    return fetcher();
  }

  const data = await fetcher();

  // 캐시 저장 (non-blocking)
  r.set(key, data, { ex: ttl }).catch(() => {});

  return data;
}

/**
 * CRM 라우트용 캐시 키 생성.
 *
 * ⚠️ 멀티테넌시/권한 안전: 센터·직원·역할·쿼리파라미터를 모두 키에 포함한다.
 *   - 센터 전체 공용 집계도 이 키면 안전(직원별로 캐시가 쪼개질 뿐 정확도는 보장).
 *   - 강사/매니저처럼 "본인 데이터만" 보는 라우트도 자동으로 스코프별 분리됨.
 * name = 라우트 식별자(예: "stats:center-revenue"), extra = 쿼리 파라미터 문자열.
 */
export function crmCacheKey(
  ctx: { centerId: number; centerMemberId: number | null; role?: string | null },
  name: string,
  extra = "",
): string {
  return `crm:${name}:c${ctx.centerId}:m${ctx.centerMemberId ?? 0}:r${ctx.role ?? "?"}:${extra}`;
}

/**
 * 특정 패턴의 캐시 무효화 (게시글 작성/수정/삭제 시 호출)
 */
export async function invalidateCache(pattern: string) {
  const r = getRedis();
  if (!r) return;
  try {
    // Upstash는 SCAN 지원. pattern에 매칭되는 키 삭제.
    const keys: string[] = [];
    let cursor = 0;
    do {
      const [nextCursor, batch] = await r.scan(cursor, { match: pattern, count: 100 });
      cursor = Number(nextCursor);
      keys.push(...batch);
    } while (cursor !== 0);
    if (keys.length > 0) {
      await r.del(...keys);
    }
  } catch {
    // 무시
  }
}
