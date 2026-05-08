import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { getBlockedUidsForRequest } from "@/app/lib/block-filter";

export const dynamic = "force-dynamic";

// GET /api/trade/by-author?nickname={...}&page=1&limit=20
// 1) 닉네임 → firebase_uid 조회 (nicknames 테이블)
// 2) trade_posts WHERE firebase_uid 일치 AND status != 'deleted' 최신순 페이지네이션
//    → 거래 게시글만 (구인/종목후기 제외)
export async function GET(request: Request) {
  const url = new URL(request.url);
  const nickname = (url.searchParams.get("nickname") || "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = Math.min(Math.max(1, Number(url.searchParams.get("limit")) || 20), 50);

  if (!nickname) {
    return NextResponse.json({ error: "nickname required" }, { status: 400 });
  }

  const { data: nick } = await supabase
    .from("nicknames")
    .select("firebase_uid")
    .eq("name", nickname)
    .maybeSingle();

  const uid = nick?.firebase_uid;
  if (!uid) {
    return NextResponse.json({ posts: [], total: 0, page, limit, totalPages: 0 });
  }

  const blocked = await getBlockedUidsForRequest(request);
  if (blocked.includes(uid)) {
    return NextResponse.json({ posts: [], total: 0, page, limit, totalPages: 0 });
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, count, error } = await supabase
    .from("trade_posts")
    .select("*", { count: "exact" })
    .eq("firebase_uid", uid)
    .neq("status", "deleted")
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const total = count ?? 0;
  return NextResponse.json({
    posts: data || [],
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}
