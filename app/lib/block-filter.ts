import { supabase } from "./supabase";
import { verifyAuth } from "./firebase-admin";

/**
 * 요청한 사용자가 차단한 사용자들의 firebase_uid 목록 반환.
 * - 비로그인: 빈 배열
 * - 인증 실패: 빈 배열
 * - 로그인했고 차단 0명: 빈 배열
 *
 * 빈 배열이면 호출자가 필터를 적용하지 않으면 됨 (성능 최적화).
 */
export async function getBlockedUidsForRequest(request: Request): Promise<string[]> {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return [];

    const user = await verifyAuth(request);
    if (!user) return [];

    const { data, error } = await supabase
      .from("user_blocks")
      .select("blocked_uid")
      .eq("blocker_uid", user.uid);

    if (error || !data) return [];
    return data.map((r) => r.blocked_uid).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * PostgREST `.not("col", "in", "(...)")` 형식의 필터 문자열 생성.
 * UIDs 가 없으면 null 반환 (호출자가 필터 스킵).
 *
 * 예시: `("uid1","uid2")` 형태 — supabase-js 의 `.not(col, "in", value)` 두번째 인자 형식.
 */
export function buildBlockedNotInValue(blockedUids: string[]): string | null {
  if (blockedUids.length === 0) return null;
  // 보안: uid 에 문제 될 만한 문자(쉼표, 괄호, 따옴표) 제거
  const safe = blockedUids
    .map((u) => String(u).replace(/[",()]/g, ""))
    .filter(Boolean);
  if (safe.length === 0) return null;
  return `(${safe.map((u) => `"${u}"`).join(",")})`;
}
