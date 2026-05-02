import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { cached } from "@/app/lib/cache";

export const revalidate = 300;

export async function GET() {
  const categories = await cached("categories:all", 300, async () => {
    const catsRes = await supabase.from("categories").select("*");
    if (catsRes.error) throw catsRes.error;

    // posts 테이블이 1000행 초과 가능 → 카테고리별 count head 쿼리 병렬
    const counts = await Promise.all(
      catsRes.data.map(async (c) => {
        const { count, error } = await supabase
          .from("posts")
          .select("*", { count: "exact", head: true })
          .eq("category_id", c.id)
          .or("is_notice.eq.false,is_notice.is.null");
        if (error) throw error;
        return { id: c.id, count: count ?? 0 };
      }),
    );
    const countMap = new Map(counts.map((x) => [x.id, x.count]));

    return catsRes.data
      .map((c) => ({ ...c, post_count: countMap.get(c.id) || 0 }))
      .sort(
        (a, b) =>
          b.post_count - a.post_count || a.name.localeCompare(b.name, "ko"),
      );
  });
  return NextResponse.json(categories);
}
