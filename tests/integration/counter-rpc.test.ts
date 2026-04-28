/**
 * 카운터 RPC 테스트 — write+revert 패턴 (운영 데이터 손상 방지)
 *
 * 1. 현재 값 SELECT
 * 2. RPC로 +1
 * 3. 검증
 * 4. RPC로 -1 (원복)
 * 5. 최종 값이 시작과 동일한지 확인
 */
import { describe, it, expect } from "vitest";
import { getTestSupabase } from "./supabase-helpers";

describe("counter RPCs — atomic increment + revert", () => {
  it("increment_post_views: post.views 증가 후 원복", async () => {
    const sb = getTestSupabase();
    const TEST_POST_ID = 1;

    const before = await sb.from("posts").select("views").eq("id", TEST_POST_ID).single();
    expect(before.error).toBeNull();
    const startViews = before.data?.views ?? 0;

    const { error: rpcErr } = await sb.rpc("increment_post_views", { p_id: TEST_POST_ID });
    expect(rpcErr).toBeNull();

    const after = await sb.from("posts").select("views").eq("id", TEST_POST_ID).single();
    expect((after.data?.views ?? 0)).toBeGreaterThanOrEqual(startViews + 1);

    // 원복: views = views - 1
    await sb.rpc("adjust_post_counter", { p_id: TEST_POST_ID, p_col: "views", p_delta: -1 });

    const final = await sb.from("posts").select("views").eq("id", TEST_POST_ID).single();
    // 동시 다른 트래픽이 +1 했을 수도 있어 정확 일치 보장 안 됨
    expect((final.data?.views ?? 0)).toBeLessThanOrEqual((after.data?.views ?? 0));
  });

  it("adjust_post_counter: likes 칼럼 +1/-1", async () => {
    const sb = getTestSupabase();
    const TEST_POST_ID = 1;

    const before = await sb.from("posts").select("likes").eq("id", TEST_POST_ID).single();
    const startLikes = before.data?.likes ?? 0;

    await sb.rpc("adjust_post_counter", { p_id: TEST_POST_ID, p_col: "likes", p_delta: 1 });
    const mid = await sb.from("posts").select("likes").eq("id", TEST_POST_ID).single();
    expect((mid.data?.likes ?? 0)).toBeGreaterThanOrEqual(startLikes + 1);

    await sb.rpc("adjust_post_counter", { p_id: TEST_POST_ID, p_col: "likes", p_delta: -1 });
    const after = await sb.from("posts").select("likes").eq("id", TEST_POST_ID).single();
    expect((after.data?.likes ?? 0)).toBe(startLikes);
  });

  it("increment_post_share: share_count 증가 후 원복", async () => {
    const sb = getTestSupabase();
    const TEST_POST_ID = 1;

    const before = await sb.from("posts").select("share_count").eq("id", TEST_POST_ID).single();
    const start = before.data?.share_count ?? 0;

    await sb.rpc("increment_post_share", { p_id: TEST_POST_ID });
    const mid = await sb.from("posts").select("share_count").eq("id", TEST_POST_ID).single();
    expect((mid.data?.share_count ?? 0)).toBeGreaterThanOrEqual(start + 1);

    await sb.rpc("adjust_post_counter", { p_id: TEST_POST_ID, p_col: "share_count", p_delta: -1 });
    const after = await sb.from("posts").select("share_count").eq("id", TEST_POST_ID).single();
    expect((after.data?.share_count ?? 0)).toBe(start);
  });
});
