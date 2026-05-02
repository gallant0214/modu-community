import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { cached } from "@/app/lib/cache";
import { getBlockedUidsForRequest } from "@/app/lib/block-filter";

export const dynamic = "force-dynamic";

type JobRow = { firebase_uid?: string | null; [k: string]: unknown };

function applyBlockedFilter<T extends JobRow>(rows: T[], blocked: Set<string>): T[] {
  if (blocked.size === 0) return rows;
  return rows.filter((r) => !r.firebase_uid || !blocked.has(r.firebase_uid));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 3, 50);
  const page = Math.max(Number(url.searchParams.get("page")) || 1, 1);
  const offset = (page - 1) * limit;
  const blocked = await getBlockedUidsForRequest(request);
  const blockedSet = new Set(blocked);
  const fetchExtra = Math.min(blocked.length, 20);

  if (url.searchParams.has("page")) {
    const result = await cached(`jobs:latest:p:${page}:l:${limit}`, 60, async () => {
      const { count } = await supabase
        .from("job_posts")
        .select("*", { count: "exact", head: true });
      const total = count ?? 0;
      const totalPages = Math.ceil(total / limit) || 1;
      const { data, error } = await supabase
        .from("job_posts")
        .select("*")
        .order("created_at", { ascending: false })
        .range(offset, offset + limit + 19);
      if (error) throw error;
      return { posts: data as JobRow[], page, totalPages, total };
    });
    const filtered = applyBlockedFilter(result.posts, blockedSet).slice(0, limit);
    return NextResponse.json({ ...result, posts: filtered });
  }

  // 홈 화면용 (60초 캐시) — 차단 보충 위해 약간 더 가져옴
  const rows = await cached(`jobs:latest:home:${limit}`, 60, async () => {
    const { data, error } = await supabase
      .from("job_posts")
      .select("*")
      .eq("is_closed", false)
      .order("created_at", { ascending: false })
      .limit(limit + 20);
    if (error) throw error;
    return data as JobRow[];
  });
  return NextResponse.json(applyBlockedFilter(rows, blockedSet).slice(0, limit));
}
