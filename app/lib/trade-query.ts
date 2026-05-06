import { supabase } from "@/app/lib/supabase";
import type { Database } from "@/app/lib/database.types";

export type TradePost = Database["public"]["Tables"]["trade_posts"]["Row"];

export interface FetchTradeArgs {
  category?: "all" | "equipment" | "center";
  q?: string;
  sido?: string;
  sigungu?: string;
  page?: number;
  limit?: number;
  sort?: "latest" | "popular";
}

export interface TradePageResult {
  posts: TradePost[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export async function fetchTradePage(args: FetchTradeArgs = {}): Promise<TradePageResult> {
  const category = args.category ?? "all";
  const q = (args.q || "").trim();
  const sido = (args.sido || "").trim();
  const sigungu = (args.sigungu || "").trim();
  const page = Math.max(1, args.page ?? 1);
  const limit = Math.min(50, args.limit ?? 20);
  const sort = args.sort ?? "latest";

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let qb = supabase
    .from("trade_posts")
    .select("*", { count: "exact" })
    .eq("status", "active");

  if (category === "equipment" || category === "center") qb = qb.eq("category", category);
  if (sido) qb = qb.eq("region_sido", sido);
  if (sigungu) qb = qb.eq("region_sigungu", sigungu);
  if (q) {
    const safe = q.slice(0, 50).replace(/[%,]/g, "");
    qb = qb.or(
      `title.ilike.%${safe}%,body.ilike.%${safe}%,product_name.ilike.%${safe}%,center_name.ilike.%${safe}%`
    );
  }

  if (sort === "popular") {
    qb = qb.order("view_count", { ascending: false }).order("created_at", { ascending: false });
  } else {
    qb = qb.order("created_at", { ascending: false });
  }

  qb = qb.range(from, to);

  const { data, count, error } = await qb;
  if (error) throw error;

  return {
    posts: (data || []) as TradePost[],
    total: count ?? 0,
    page,
    limit,
    hasMore: (count ?? 0) > to + 1,
  };
}
