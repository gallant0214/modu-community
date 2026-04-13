/**
 * Upstash Redis 캐시 유틸리티
 *
 * UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN 이 설정돼 있으면
 * Redis 캐시를 사용하고, 없으면 캐시 없이 원본 데이터를 직접 반환 (graceful fallback).
 */

let redis: import("@upstash/redis").Redis | null = null;

function getRedis() {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
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
