import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * 초성 문자를 해당 한글 음절 범위 정규식으로 변환
 */
function choToRegex(query: string): string | null {
  const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
  const hasCho = [...query].some((ch) => CHO.includes(ch));
  if (!hasCho) return null;

  let regex = "";
  for (const ch of query) {
    const idx = CHO.indexOf(ch);
    if (idx >= 0) {
      const start = String.fromCharCode(0xac00 + idx * 588);
      const end = String.fromCharCode(0xac00 + idx * 588 + 587);
      regex += `[${start}-${end}]`;
    } else {
      regex += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return regex;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 50);

  if (!q) {
    return NextResponse.json({ posts: [], jobs: [] });
  }

  const choRegex = choToRegex(q);

  if (choRegex) {
    // 초성 검색: PostgreSQL ~ regex 통한 rpc
    const [postsRes, jobsRes] = await Promise.all([
      supabase.rpc("search_posts_by_regex", { p_pattern: choRegex, p_limit: limit }),
      supabase.rpc("search_jobs_by_regex", { p_pattern: choRegex, p_limit: limit }),
    ]);
    if (postsRes.error || jobsRes.error) {
      return NextResponse.json(
        { posts: [], jobs: [], error: postsRes.error?.message || jobsRes.error?.message },
        { status: 500 },
      );
    }
    return NextResponse.json({ posts: postsRes.data, jobs: jobsRes.data });
  }

  // 일반 검색: ILIKE (PostgREST에선 wildcard가 * 임)
  const wild = `*${q}*`;
  const [postsRes, jobsRes] = await Promise.all([
    supabase
      .from("posts")
      .select("*, categories(name)")
      .or("is_notice.eq.false,is_notice.is.null")
      .or(`title.ilike.${wild},content.ilike.${wild},author.ilike.${wild},region.ilike.${wild}`)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("job_posts")
      .select("*")
      .or("is_closed.eq.false,is_closed.is.null")
      .or(`title.ilike.${wild},description.ilike.${wild},center_name.ilike.${wild},sport.ilike.${wild},region_name.ilike.${wild},address.ilike.${wild}`)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  if (postsRes.error || jobsRes.error) {
    return NextResponse.json(
      { posts: [], jobs: [], error: postsRes.error?.message || jobsRes.error?.message },
      { status: 500 },
    );
  }

  const posts = postsRes.data.map(({ categories: cat, ...p }) => ({
    ...p,
    category_name: cat?.name ?? null,
  }));

  return NextResponse.json({ posts, jobs: jobsRes.data });
}
