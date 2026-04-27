import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type PostWithCategory = {
  categories?: { name: string } | null;
  [k: string]: unknown;
};

function flatten<T extends PostWithCategory>(rows: T[]) {
  return rows.map(({ categories: cat, ...rest }) => ({
    ...rest,
    category_name: cat?.name ?? null,
  }));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 3, 50);
  const page = Math.max(Number(url.searchParams.get("page")) || 1, 1);
  const offset = (page - 1) * limit;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  if (url.searchParams.has("page")) {
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
      .order("views", { ascending: false })
      .order("likes", { ascending: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;

    return NextResponse.json({ posts: flatten(data), page, totalPages, total });
  }

  // 홈 화면용: 이번 달 좋아요 있는 글 우선
  const monthly = await supabase
    .from("posts")
    .select("*, categories(name)")
    .or("is_notice.eq.false,is_notice.is.null")
    .gte("created_at", monthStart)
    .gt("likes", 0)
    .order("likes", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (monthly.error) throw monthly.error;

  if (monthly.data.length >= limit) {
    return NextResponse.json(flatten(monthly.data));
  }

  // 부족하면 조회수 기준 fallback
  const fallback = await supabase
    .from("posts")
    .select("*, categories(name)")
    .or("is_notice.eq.false,is_notice.is.null")
    .order("views", { ascending: false })
    .order("likes", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (fallback.error) throw fallback.error;

  return NextResponse.json(flatten(fallback.data));
}
