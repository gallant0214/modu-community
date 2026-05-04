import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAdminPassword } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

// POST /api/admin/kpi
// body: { password, from?: ISO_string, to?: ISO_string }
// from/to 가 없으면 "전체" 모드 (기존 동작 유지)
// from/to 가 있으면 해당 범위에 대한 in-range 카운트 계산
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { password, from, to } = body;
  if (!(await verifyAdminPassword(password))) {
    return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
  }

  const fromDate = from ? new Date(from).toISOString() : null;
  const toDate = to ? new Date(to).toISOString() : null;

  const sb = supabase as any;

  const countAll = async (table: string) => {
    try {
      const { count } = await sb.from(table).select("*", { count: "exact", head: true });
      return count ?? 0;
    } catch { return 0; }
  };
  const countRange = async (table: string, col = "created_at", extra?: (q: any) => any) => {
    try {
      let q = sb.from(table).select("*", { count: "exact", head: true });
      if (fromDate) q = q.gte(col, fromDate);
      if (toDate) q = q.lte(col, toDate);
      if (extra) q = extra(q);
      const { count } = await q;
      return count ?? 0;
    } catch { return 0; }
  };

  // 병렬 쿼리
  const [
    usersTotal, usersInRange,
    postsTotal, postsInRange,
    commentsTotal, commentsInRange,
    jobsTotal, jobsOpen, jobsClosed, jobsInRange,
    reportsTotal, reportsPending, reportsInRange,
    inquiriesTotal, inquiriesPending, inquiriesInRange,
    postLikesTotal, postLikesInRange,
    commentLikesTotal, commentLikesInRange,
    postBookmarksTotal, postBookmarksInRange,
    jobBookmarksTotal, jobBookmarksInRange,
    storeAppTotal, storeAppRange, storeGoogleTotal, storeGoogleRange,
    visitsTotal, visitsInRange, uniqueVisitorsRange,
  ] = await Promise.all([
    // 사용자
    countAll("nicknames"),
    countRange("nicknames"),
    // 게시글
    countAll("posts"),
    countRange("posts"),
    // 댓글
    countAll("comments"),
    countRange("comments"),
    // 구인글
    countAll("job_posts"),
    countRange("job_posts", "created_at", (q) => q.eq("is_closed", false)),
    countRange("job_posts", "created_at", (q) => q.eq("is_closed", true)),
    countRange("job_posts"),
    // 신고
    countAll("reports"),
    countRange("reports", "created_at", (q) => q.eq("resolved", false)),
    countRange("reports"),
    // 문의
    countAll("inquiries"),
    countRange("inquiries", "created_at", (q) => q.is("reply", null)),
    countRange("inquiries"),
    // 게시글 좋아요
    countAll("post_likes"),
    countRange("post_likes"),
    // 댓글 좋아요
    countAll("comment_likes"),
    countRange("comment_likes"),
    // 북마크
    countAll("post_bookmarks"),
    countRange("post_bookmarks"),
    countAll("job_post_bookmarks"),
    countRange("job_post_bookmarks"),
    // 스토어 클릭
    countRange("store_clicks", "clicked_at", (q) => q.eq("store", "app_store")),
    countRange("store_clicks", "clicked_at", (q) => q.eq("store", "app_store")),
    countRange("store_clicks", "clicked_at", (q) => q.eq("store", "google_play")),
    countRange("store_clicks", "clicked_at", (q) => q.eq("store", "google_play")),
    // 방문자 (페이지뷰)
    countAll("site_visits"),
    countRange("site_visits", "visited_at"),
    // 기간내 unique 방문자 (DISTINCT ip_hash) — view 없이 RPC 또는 직접 raw count
    (async () => {
      try {
        let q = sb.from("site_visits").select("ip_hash", { head: false }).not("ip_hash", "is", null);
        if (fromDate) q = q.gte("visited_at", fromDate);
        if (toDate) q = q.lte("visited_at", toDate);
        const { data } = await q.limit(50000); // 안전 한도
        if (!data) return 0;
        const set = new Set<string>();
        for (const r of data) if (r.ip_hash) set.add(r.ip_hash);
        return set.size;
      } catch { return 0; }
    })(),
  ]);

  // store_clicks total은 전체 모드에서도 보고 싶으니 추가 조회
  const [storeAppAllTotal, storeGoogleAllTotal] = await Promise.all([
    (async () => {
      const { count } = await sb.from("store_clicks").select("*", { count: "exact", head: true }).eq("store", "app_store");
      return count ?? 0;
    })(),
    (async () => {
      const { count } = await sb.from("store_clicks").select("*", { count: "exact", head: true }).eq("store", "google_play");
      return count ?? 0;
    })(),
  ]);

  // 활성도 (기간 내 글/댓글 작성한 distinct firebase_uid)
  let activePostersInRange = 0, activeCommentersInRange = 0;
  try {
    let pq = sb.from("posts").select("firebase_uid").not("firebase_uid", "is", null);
    if (fromDate) pq = pq.gte("created_at", fromDate);
    if (toDate) pq = pq.lte("created_at", toDate);
    const { data: pRows } = await pq.limit(50000);
    activePostersInRange = new Set((pRows || []).map((r: any) => r.firebase_uid)).size;

    let cq = sb.from("comments").select("firebase_uid").not("firebase_uid", "is", null);
    if (fromDate) cq = cq.gte("created_at", fromDate);
    if (toDate) cq = cq.lte("created_at", toDate);
    const { data: cRows } = await cq.limit(50000);
    activeCommentersInRange = new Set((cRows || []).map((r: any) => r.firebase_uid)).size;
  } catch { /* skip */ }

  // 인기 종목 (기간 내 게시글 수 기준 top 5)
  let topCategories: { name: string; count: number }[] = [];
  try {
    let pq = sb.from("posts").select("category_id");
    if (fromDate) pq = pq.gte("created_at", fromDate);
    if (toDate) pq = pq.lte("created_at", toDate);
    const { data: pRows } = await pq.limit(50000);
    const map = new Map<number, number>();
    for (const r of pRows || []) {
      if (r.category_id) map.set(r.category_id, (map.get(r.category_id) || 0) + 1);
    }
    const top = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (top.length > 0) {
      const ids = top.map(([id]) => id);
      const { data: cats } = await sb.from("categories").select("id, name").in("id", ids);
      const nameMap = new Map<number, string>((cats || []).map((c: any) => [c.id, c.name]));
      topCategories = top.map(([id, count]) => ({ name: nameMap.get(id) || `#${id}`, count }));
    }
  } catch { /* skip */ }

  // 인기 게시글 (기간 내 좋아요 + 조회 기준 top 5)
  let topPosts: any[] = [];
  try {
    let pq = sb.from("posts").select("id, title, likes, views, comments_count").order("likes", { ascending: false });
    if (fromDate) pq = pq.gte("created_at", fromDate);
    if (toDate) pq = pq.lte("created_at", toDate);
    const { data } = await pq.limit(5);
    topPosts = (data || []).map((p: any) => ({ id: p.id, title: p.title, likes: p.likes, views: p.views, comments: p.comments_count }));
  } catch { /* skip */ }

  return NextResponse.json({
    range: { from: fromDate, to: toDate },
    users: { total: usersTotal, inRange: usersInRange },
    posts: { total: postsTotal, inRange: postsInRange },
    comments: { total: commentsTotal, inRange: commentsInRange },
    jobs: { total: jobsTotal, open: jobsOpen, closed: jobsClosed, inRange: jobsInRange },
    reports: { total: reportsTotal, pending: reportsPending, inRange: reportsInRange },
    inquiries: { total: inquiriesTotal, pending: inquiriesPending, inRange: inquiriesInRange },
    engagement: {
      postLikesTotal, postLikesInRange,
      commentLikesTotal, commentLikesInRange,
      postBookmarksTotal, postBookmarksInRange,
      jobBookmarksTotal, jobBookmarksInRange,
      activePostersInRange, activeCommentersInRange,
    },
    storeClicks: {
      appStoreTotal: storeAppAllTotal, appStoreInRange: storeAppRange,
      googlePlayTotal: storeGoogleAllTotal, googlePlayInRange: storeGoogleRange,
    },
    visits: {
      total: visitsTotal,
      inRange: visitsInRange,
      uniqueInRange: uniqueVisitorsRange,
    },
    topCategories,
    topPosts,
  });
}
