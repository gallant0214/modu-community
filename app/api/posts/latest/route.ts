import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { cached } from "@/app/lib/cache";

export const dynamic = "force-dynamic";

type PostWithCategory = {
  categories?: { name: string } | null;
  [k: string]: unknown;
};

function flattenCategoryName<T extends PostWithCategory>(rows: T[]) {
  return rows.map(({ categories: cat, ...rest }) => ({
    ...rest,
    category_name: cat?.name ?? null,
  }));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 5, 50);
  const page = Math.max(Number(url.searchParams.get("page")) || 1, 1);
  const offset = (page - 1) * limit;

  if (url.searchParams.has("page")) {
    const result = await cached(`posts:latest:p:${page}:l:${limit}`, 60, async () => {
      const { count, error: countErr } = await supabase
        .from("posts")
        .select("*", { count: "exact", head: true })
        .or("is_notice.eq.false,is_notice.is.null");
      if (countErr) throw countErr;
      const total = count ?? 0;
      const totalPages = Math.ceil(total / limit) || 1;

      const { data, error } = await supabase
        .from("posts")
        .select("*, categories(name)")
        .or("is_notice.eq.false,is_notice.is.null")
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw error;
      return { posts: flattenCategoryName(data), page, totalPages, total };
    });
    return NextResponse.json(result);
  }

  const posts = await cached(`posts:latest:home:${limit}`, 60, async () => {
    const { data, error } = await supabase
      .from("posts")
      .select("*, categories(name)")
      .or("is_notice.eq.false,is_notice.is.null")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return flattenCategoryName(data);
  });
  return NextResponse.json(posts);
}
