import { describe, it, expect } from "vitest";
import { getTestSupabase } from "./supabase-helpers";

describe("posts list — pagination + sort + categories(name) join", () => {
  it("latest: created_at desc + category_name 평탄화 가능", async () => {
    const sb = getTestSupabase();
    const { data, error } = await sb
      .from("posts")
      .select("id, title, created_at, categories(name)")
      .or("is_notice.eq.false,is_notice.is.null")
      .order("created_at", { ascending: false })
      .limit(5);

    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);

    // 정렬 검증
    for (let i = 0; i < data!.length - 1; i++) {
      const a = new Date(data![i].created_at!).getTime();
      const b = new Date(data![i + 1].created_at!).getTime();
      expect(a).toBeGreaterThanOrEqual(b);
    }

    // category_name 평탄화 패턴 (route에서 하는 것)
    const flat = data!.map(({ categories: cat, ...rest }) => ({
      ...rest,
      category_name: cat?.name ?? null,
    }));
    expect(flat[0]).toHaveProperty("category_name");
  });

  it("popular: views desc + likes 우선", async () => {
    const sb = getTestSupabase();
    const { data, error } = await sb
      .from("posts")
      .select("id, views, likes, created_at")
      .or("is_notice.eq.false,is_notice.is.null")
      .order("views", { ascending: false })
      .order("likes", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5);

    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);

    for (let i = 0; i < data!.length - 1; i++) {
      const va = data![i].views ?? 0;
      const vb = data![i + 1].views ?? 0;
      expect(va).toBeGreaterThanOrEqual(vb);
    }
  });

  it("notice: is_notice=true 1개 이상", async () => {
    const sb = getTestSupabase();
    const { data, error } = await sb
      .from("posts")
      .select("id, title, is_notice")
      .eq("is_notice", true)
      .limit(5);

    expect(error).toBeNull();
    for (const p of data!) {
      expect(p.is_notice).toBe(true);
    }
  });

  it("range pagination: limit + offset", async () => {
    const sb = getTestSupabase();
    const limit = 5;
    const page1 = await sb
      .from("posts")
      .select("id")
      .or("is_notice.eq.false,is_notice.is.null")
      .order("created_at", { ascending: false })
      .range(0, limit - 1);
    const page2 = await sb
      .from("posts")
      .select("id")
      .or("is_notice.eq.false,is_notice.is.null")
      .order("created_at", { ascending: false })
      .range(limit, limit * 2 - 1);

    expect(page1.error).toBeNull();
    expect(page2.error).toBeNull();
    expect(page1.data!.length).toBeLessThanOrEqual(limit);
    expect(page2.data!.length).toBeLessThanOrEqual(limit);

    const ids1 = new Set(page1.data!.map((r) => r.id));
    const ids2 = new Set(page2.data!.map((r) => r.id));
    const overlap = [...ids1].filter((id) => ids2.has(id));
    expect(overlap).toHaveLength(0); // 페이지간 중복 없음
  });
});
