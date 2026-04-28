import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/app/lib/database.types";

/** 테스트 전용 supabase client (singleton) */
let _client: ReturnType<typeof createClient<Database>> | null = null;
export function getTestSupabase() {
  if (!_client) {
    _client = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return _client;
}

/** 테스트 데이터 마커 — cleanup용 */
export const TEST_MARKER = "__vitest_integration_test__";

/** 테스트 시작 전 호출 — 이전 실행이 남긴 잔존 테스트 데이터 제거 */
export async function cleanupTestData() {
  const sb = getTestSupabase();
  await sb.from("comments").delete().eq("ip_address", TEST_MARKER);
  await sb.from("post_likes").delete().eq("ip_address", TEST_MARKER);
  await sb.from("comment_likes").delete().eq("ip_address", TEST_MARKER);
}
