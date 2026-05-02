import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { getBlockedUidsForRequest } from "@/app/lib/block-filter";

export const dynamic = "force-dynamic";

type PostWithCategory = {
  categories?: { name: string } | null;
  firebase_uid?: string | null;
  [k: string]: unknown;
};

function flatten<T extends PostWithCategory>(rows: T[]) {
  return rows.map(({ categories: cat, ...rest }) => ({
    ...rest,
    category_name: cat?.name ?? null,
  }));
}

function filterBlocked<T extends PostWithCategory>(rows: T[], blocked: string[]): T[] {
  if (blocked.length === 0) return rows;
  const set = new Set(blocked);
  return rows.filter((r) => !r.firebase_uid || !set.has(r.firebase_uid));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 3, 50);
  const page = Math.max(Number(url.searchParams.get("page")) || 1, 1);
  const offset = (page - 1) * limit;
  const blocked = await getBlockedUidsForRequest(request);

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

    return NextResponse.json({ posts: filterBlocked(flatten(data), blocked), page, totalPages, total });
  }

  // 홈 화면용: 이번 달 좋아요 있는 글 우선 (차단 글 제외 후 부족하면 더 가져옴)
  const fetchSize = limit + Math.min(blocked.length, 20);
  const monthly = await supabase
    .from("posts")
    .select("*, categories(name)")
    .or("is_notice.eq.false,is_notice.is.null")
    .gte("created_at", monthStart)
    .gt("likes", 0)
    .order("likes", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(fetchSize);
  if (monthly.error) throw monthly.error;

  const monthlyFiltered = filterBlocked(flatten(monthly.data), blocked).slice(0, limit);
  if (monthlyFiltered.length >= limit) {
    return NextResponse.json(monthlyFiltered);
  }

  // 부족하면 조회수 기준 fallback
  const fallback = await supabase
    .from("posts")
    .select("*, categories(name)")
    .or("is_notice.eq.false,is_notice.is.null")
    .order("views", { ascending: false })
    .order("likes", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(fetchSize);
  if (fallback.error) throw fallback.error;

  return NextResponse.json(filterBlocked(flatten(fallback.data), blocked).slice(0, limit));
}
