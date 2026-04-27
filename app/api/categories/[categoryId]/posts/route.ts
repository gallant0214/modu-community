import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { cached } from "@/app/lib/cache";

export const dynamic = "force-dynamic";

type Sort = "latest" | "popular" | "helpful";
type SearchFilter = "title" | "content" | "author" | "region" | "all";

function applySort(
  q: ReturnType<typeof supabase.from>,
  sort: Sort,
) {
  if (sort === "popular") {
    return q
      .order("views", { ascending: false })
      .order("created_at", { ascending: false });
  }
  if (sort === "helpful") {
    return q
      .order("likes", { ascending: false })
      .order("created_at", { ascending: false });
  }
  return q.order("created_at", { ascending: false });
}

function applySearch(
  q: ReturnType<typeof supabase.from>,
  filter: SearchFilter,
  wild: string,
) {
  if (filter === "title") return q.ilike("title", wild);
  if (filter === "content") return q.ilike("content", wild);
  if (filter === "author") return q.ilike("author", wild);
  if (filter === "region") return q.ilike("region", wild);
  return q.or(
    `title.ilike.${wild},content.ilike.${wild},author.ilike.${wild},region.ilike.${wild}`,
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ categoryId: string }> }
) {
  const { categoryId } = await params;
  const catId = Number(categoryId);
  const url = new URL(request.url);

  const sortMode = (url.searchParams.get("sort") || "latest") as Sort;
  const currentPage = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const perPage = 10;
  const offset = (currentPage - 1) * perPage;
  const searchQuery = url.searchParams.get("q")?.trim() || "";
  const searchFilter = (url.searchParams.get("searchType") || "all") as SearchFilter;
  const isSearching = searchQuery.length > 0;
  const wild = `*${searchQuery}*`;

  const noticePostsPromise = cached("notices", 300, async () => {
    const { data } = await supabase
      .from("posts")
      .select("*")
      .eq("is_notice", true)
      .order("created_at", { ascending: false })
      .limit(1);
    return data || [];
  });
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const topPostsPromise = cached(
    `top:cat:${catId}:${now.getFullYear()}-${now.getMonth()}`,
    120,
    async () => {
      const { data } = await supabase
        .from("posts")
        .select("*")
        .eq("category_id", catId)
        .gte("created_at", monthStart)
        .gt("likes", 0)
        .order("likes", { ascending: false })
        .limit(3);
      return data || [];
    },
  );

  let posts: unknown[] = [];
  let totalCount = 0;

  if (isSearching) {
    const baseFilter = (q: ReturnType<typeof supabase.from>) => {
      const withCategory = q.eq("category_id", catId);
      const withNotice = withCategory.or("is_notice.eq.false,is_notice.is.null");
      return applySearch(withNotice, searchFilter, wild);
    };
    const { count } = await baseFilter(
      supabase.from("posts").select("*", { count: "exact", head: true }),
    );
    totalCount = count ?? 0;

    const { data } = await applySort(
      baseFilter(supabase.from("posts").select("*")),
      "latest",
    ).range(offset, offset + perPage - 1);
    posts = data || [];
  } else {
    const cacheKey = `posts:cat:${catId}:sort:${sortMode}:p:${currentPage}`;
    const result = await cached(cacheKey, 60, async () => {
      const { count } = await supabase
        .from("posts")
        .select("*", { count: "exact", head: true })
        .eq("category_id", catId)
        .or("is_notice.eq.false,is_notice.is.null");
      const tc = count ?? 0;

      const { data } = await applySort(
        supabase
          .from("posts")
          .select("*")
          .eq("category_id", catId)
          .or("is_notice.eq.false,is_notice.is.null"),
        sortMode,
      ).range(offset, offset + perPage - 1);

      return { posts: data || [], totalCount: tc };
    });
    posts = result.posts;
    totalCount = result.totalCount;
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));

  const [noticePosts, topPosts] = await Promise.all([noticePostsPromise, topPostsPromise]);

  return NextResponse.json({
    posts,
    totalCount,
    totalPages,
    noticePosts,
    topPosts,
  });
}
