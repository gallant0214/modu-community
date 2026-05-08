import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { getBlockedUidsForRequest } from "@/app/lib/block-filter";

export const dynamic = "force-dynamic";

// GET /api/posts/by-author?nickname={...}&page=1&limit=20
// 작성자(닉네임) 의 종목후기 게시글을 카테고리 무관하게 최신순으로 페이지 단위 반환.
// 정확한 닉네임 일치(eq) — 부분 일치 검색이 아님.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const nickname = (url.searchParams.get("nickname") || "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = Math.min(Math.max(1, Number(url.searchParams.get("limit")) || 20), 50);

  if (!nickname) {
    return NextResponse.json({ error: "nickname required" }, { status: 400 });
  }

  const blocked = await getBlockedUidsForRequest(request);
  const blockedSet = new Set(blocked);

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, count, error } = await supabase
    .from("posts")
    .select("*, categories(name)", { count: "exact" })
    .eq("author", nickname)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 작성자 차단 후처리 — 본인이 차단한 사용자가 닉네임이 같은 경우 제외 (드문 케이스)
  type PostRow = { firebase_uid?: string | null; categories?: { name?: string } | null;[k: string]: unknown };
  const posts = (data || []).map((row) => {
    const r = row as PostRow;
    const { categories: cat, ...rest } = r;
    return {
      ...rest,
      category_name: cat?.name ?? null,
    };
  }).filter((p) => !p.firebase_uid || !blockedSet.has(String(p.firebase_uid)));

  const total = count ?? posts.length;
  return NextResponse.json({
    posts,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}
