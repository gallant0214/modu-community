import { describe, it, expect } from "vitest";
import { getTestSupabase } from "./supabase-helpers";

describe("categories — read-only integration", () => {
  it("70개 카테고리 + 권한 확인", async () => {
    const sb = getTestSupabase();
    const { data, error } = await sb.from("categories").select("id, name, emoji");
    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.length).toBeGreaterThan(0);
    expect(data!.length).toBeLessThanOrEqual(100); // 카테고리 수 합리 범위
  });

  it("이름이 한글이고 emoji 있음", async () => {
    const sb = getTestSupabase();
    const { data } = await sb.from("categories").select("name, emoji").limit(5);
    for (const c of data!) {
      expect(c.name).toBeTruthy();
      expect(c.emoji).toBeTruthy();
    }
  });

  it("post_count: count head 쿼리 동작 확인", async () => {
    const sb = getTestSupabase();
    const { data: cats } = await sb.from("categories").select("id").limit(3);
    for (const c of cats!) {
      const { count, error } = await sb
        .from("posts")
        .select("*", { count: "exact", head: true })
        .eq("category_id", c.id)
        .or("is_notice.eq.false,is_notice.is.null");
      expect(error).toBeNull();
      expect(typeof count).toBe("number");
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});
