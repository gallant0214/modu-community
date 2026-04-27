import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { cached } from "@/app/lib/cache";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 3, 50);
  const page = Math.max(Number(url.searchParams.get("page")) || 1, 1);
  const offset = (page - 1) * limit;

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
        .range(offset, offset + limit - 1);
      if (error) throw error;
      return { posts: data, page, totalPages, total };
    });
    return NextResponse.json(result);
  }

  // 홈 화면용 (60초 캐시)
  const rows = await cached(`jobs:latest:home:${limit}`, 60, async () => {
    const { data, error } = await supabase
      .from("job_posts")
      .select("*")
      .eq("is_closed", false)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  });
  return NextResponse.json(rows);
}
