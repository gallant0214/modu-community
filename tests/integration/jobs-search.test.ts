/**
 * jobs 검색/필터 RPC 통합 테스트
 *
 * search_job_posts(...) + count_job_posts(...) 가 실제 DB에서 정상 동작하는지 검증
 */
import { describe, it, expect } from "vitest";
import { getTestSupabase } from "./supabase-helpers";

describe("jobs search RPC", () => {
  it("count_job_posts: 빈 필터 시 전체 카운트", async () => {
    const sb = getTestSupabase();
    const { data, error } = await sb.rpc("count_job_posts", {
      p_region_code: "",
      p_parent_code: "",
      p_sub_name_pattern: "",
      p_search_pattern: "",
      p_search_type: "all",
      p_employment_type: "",
      p_sport_filter: "",
      p_hide_closed: false,
    });
    expect(error).toBeNull();
    expect(typeof data).toBe("number");
    expect(data!).toBeGreaterThan(0);
  });

  it("search_job_posts: 빈 필터 + limit 5", async () => {
    const sb = getTestSupabase();
    const { data, error } = await sb.rpc("search_job_posts", {
      p_region_code: "",
      p_parent_code: "",
      p_sub_name_pattern: "",
      p_search_pattern: "",
      p_search_type: "all",
      p_employment_type: "",
      p_sport_filter: "",
      p_hide_closed: false,
      p_order_col: "created_at",
      p_limit: 5,
      p_offset: 0,
    });
    expect(error).toBeNull();
    expect(data!.length).toBeLessThanOrEqual(5);
    if (data!.length > 0) {
      expect(data![0]).toHaveProperty("id");
      expect(data![0]).toHaveProperty("title");
    }
  });

  it("search_job_posts: hide_closed=true 시 closed 제외", async () => {
    const sb = getTestSupabase();
    const { data } = await sb.rpc("search_job_posts", {
      p_region_code: "",
      p_parent_code: "",
      p_sub_name_pattern: "",
      p_search_pattern: "",
      p_search_type: "all",
      p_employment_type: "",
      p_sport_filter: "",
      p_hide_closed: true,
      p_order_col: "created_at",
      p_limit: 20,
      p_offset: 0,
    });
    for (const j of data ?? []) {
      expect(j.is_closed).not.toBe(true);
    }
  });

  it("search_job_posts: title ILIKE 매칭", async () => {
    const sb = getTestSupabase();
    const { data } = await sb.rpc("search_job_posts", {
      p_region_code: "",
      p_parent_code: "",
      p_sub_name_pattern: "",
      p_search_pattern: "%수영%",
      p_search_type: "title",
      p_employment_type: "",
      p_sport_filter: "",
      p_hide_closed: false,
      p_order_col: "created_at",
      p_limit: 20,
      p_offset: 0,
    });
    if (data && data.length > 0) {
      for (const j of data) {
        const text = `${j.title} ${j.description || ""}`;
        expect(text.toLowerCase().includes("수영") || text.includes("수영")).toBe(true);
      }
    }
  });
});
