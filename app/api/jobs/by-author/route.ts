import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { getBlockedUidsForRequest } from "@/app/lib/block-filter";

export const dynamic = "force-dynamic";

// GET /api/jobs/by-author?nickname={...}&page=1&limit=20
// 1) 닉네임 → firebase_uid 조회
// 2) job_posts WHERE firebase_uid 일치 AND source != 'work24' (= 고용24 임포트 제외)
//    AND hidden=false 최신순 페이지네이션
//    → 사용자가 직접 작성한 구인글만
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

  let qb = supabase
    .from("job_posts")
    .select("*", { count: "exact" })
    .eq("firebase_uid", uid)
    .order("created_at", { ascending: false });

  // hidden 컬럼이 있는 환경에서만 필터 — 없으면 무시
  qb = qb.or("hidden.is.null,hidden.eq.false");

  // 고용24 임포트 글 제외 (source='work24')
  qb = qb.or("source.is.null,source.neq.work24");

  qb = qb.range(from, to);

  const { data, count, error } = await qb;
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
