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
  const { password, from, to, visitFrom, visitTo, reportFrom, reportTo } = body;
  if (!(await verifyAdminPassword(password))) {
    return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
  }

  const fromDate = from ? new Date(from).toISOString() : null;
  const toDate = to ? new Date(to).toISOString() : null;
  // 방문자/유입 분석 전용 별도 기간 (없으면 일반 from/to fallback)
  const visitFromDate = visitFrom ? new Date(visitFrom).toISOString() : fromDate;
  const visitToDate = visitTo ? new Date(visitTo).toISOString() : toDate;
  // 신고 분석 전용 별도 기간
  const reportFromDate = reportFrom ? new Date(reportFrom).toISOString() : fromDate;
  const reportToDate = reportTo ? new Date(reportTo).toISOString() : toDate;

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
    // 방문자 (페이지뷰) — 방문자 전용 기간 사용
    countAll("site_visits"),
    (async () => {
      try {
        let q = sb.from("site_visits").select("*", { count: "exact", head: true });
        if (visitFromDate) q = q.gte("visited_at", visitFromDate);
        if (visitToDate) q = q.lte("visited_at", visitToDate);
        const { count } = await q;
        return count ?? 0;
      } catch { return 0; }
    })(),
    // 기간내 unique 방문자 (DISTINCT ip_hash)
    (async () => {
      try {
        let q = sb.from("site_visits").select("ip_hash", { head: false }).not("ip_hash", "is", null);
        if (visitFromDate) q = q.gte("visited_at", visitFromDate);
        if (visitToDate) q = q.lte("visited_at", visitToDate);
        const { data } = await q.limit(50000);
        if (!data) return 0;
        const set = new Set<string>();
        for (const r of data) if (r.ip_hash) set.add(r.ip_hash);
        return set.size;
      } catch { return 0; }
    })(),
  ]);

  // 방문자 상세 분석 (일별/시간별/요일별/채널/키워드) — 한 번의 큰 쿼리로 받아 인메모리 집계
  type VisitAgg = {
    dailyChart: { date: string; count: number }[];
    hourlyChart: { hour: number; count: number }[];
    weekdayChart: { weekday: number; count: number }[]; // 0=일 ~ 6=토
    channels: { name: string; count: number; percent: number }[];
    keywords: { keyword: string; count: number; percent: number }[];
  };
  const visitsAgg: VisitAgg = await (async () => {
    const empty: VisitAgg = { dailyChart: [], hourlyChart: [], weekdayChart: [], channels: [], keywords: [] };
    try {
      let q = sb.from("site_visits").select("visited_at, referrer");
      if (visitFromDate) q = q.gte("visited_at", visitFromDate);
      if (visitToDate) q = q.lte("visited_at", visitToDate);
      const { data } = await q.order("visited_at", { ascending: true }).limit(50000);
      if (!data || data.length === 0) return empty;

      const dayMap = new Map<string, number>();
      const hourArr = new Array(24).fill(0);
      const wkArr = new Array(7).fill(0);
      const channelMap = new Map<string, number>();
      const keywordMap = new Map<string, number>();

      const classifyChannel = (ref: string | null | undefined): string => {
        if (!ref) return "직접 방문";
        try {
          const u = new URL(ref);
          const h = u.hostname.toLowerCase();
          if (/(^|\.)naver\.com$/.test(h)) {
            if (/map\./.test(h)) return "네이버 지도";
            if (/blog\./.test(h)) return "네이버 블로그";
            if (/cafe\./.test(h)) return "네이버 카페";
            return "네이버 검색";
          }
          if (/(^|\.)google\./.test(h)) return "Google 검색";
          if (/(^|\.)daum\.net$/.test(h)) return "다음 검색";
          if (/(^|\.)bing\.com$/.test(h)) return "Bing 검색";
          if (/(^|\.)instagram\.com$/.test(h)) return "인스타그램";
          if (/(^|\.)facebook\.com$/.test(h) || /(^|\.)fb\.com$/.test(h)) return "페이스북";
          if (/(^|\.)youtube\.com$/.test(h)) return "유튜브";
          if (/(^|\.)twitter\.com$/.test(h) || /(^|\.)x\.com$/.test(h)) return "트위터/X";
          if (/(^|\.)kakao\.com$/.test(h)) return "카카오";
          return h.replace(/^www\./, "");
        } catch {
          return "기타";
        }
      };

      const extractKeyword = (ref: string | null | undefined): string | null => {
        if (!ref) return null;
        try {
          const u = new URL(ref);
          const params = u.searchParams;
          // Naver/Daum/Bing → query, Google → q
          const keys = ["query", "q", "wd", "search", "keyword"];
          for (const k of keys) {
            const v = params.get(k);
            if (v && v.trim()) return v.trim().slice(0, 80);
          }
          return null;
        } catch {
          return null;
        }
      };

      for (const row of data) {
        const dt = new Date(row.visited_at);
        if (isNaN(dt.getTime())) continue;
        const yyyy = dt.getFullYear();
        const mm = String(dt.getMonth() + 1).padStart(2, "0");
        const dd = String(dt.getDate()).padStart(2, "0");
        const dayKey = `${yyyy}-${mm}-${dd}`;
        dayMap.set(dayKey, (dayMap.get(dayKey) || 0) + 1);
        hourArr[dt.getHours()]++;
        wkArr[dt.getDay()]++;
        const ch = classifyChannel(row.referrer);
        channelMap.set(ch, (channelMap.get(ch) || 0) + 1);
        const kw = extractKeyword(row.referrer);
        if (kw) keywordMap.set(kw, (keywordMap.get(kw) || 0) + 1);
      }

      const dailyChart = [...dayMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, count]) => ({ date, count }));
      const hourlyChart = hourArr.map((count, hour) => ({ hour, count }));
      const weekdayChart = wkArr.map((count, weekday) => ({ weekday, count }));

      const totalChannel = [...channelMap.values()].reduce((a, b) => a + b, 0) || 1;
      const channels = [...channelMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, count]) => ({ name, count, percent: Math.round((count / totalChannel) * 10000) / 100 }));

      const totalKeyword = [...keywordMap.values()].reduce((a, b) => a + b, 0) || 1;
      const keywords = [...keywordMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([keyword, count]) => ({ keyword, count, percent: Math.round((count / totalKeyword) * 10000) / 100 }));

      return { dailyChart, hourlyChart, weekdayChart, channels, keywords };
    } catch {
      return empty;
    }
  })();

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

  // 신고 분석: target_type 별 카운트 (post/comment/job/message)
  let reportsByType: { type: string; label: string; count: number }[] = [
    { type: "post", label: "게시물 신고", count: 0 },
    { type: "comment", label: "댓글 신고", count: 0 },
    { type: "job", label: "구인글 신고", count: 0 },
    { type: "message", label: "쪽지 신고", count: 0 },
  ];
  let reportsTotalForRange = 0;
  try {
    let q = sb.from("reports").select("target_type");
    if (reportFromDate) q = q.gte("created_at", reportFromDate);
    if (reportToDate) q = q.lte("created_at", reportToDate);
    const { data } = await q.limit(50000);
    const typeMap = new Map<string, number>();
    for (const r of data || []) {
      if (r.target_type) typeMap.set(r.target_type, (typeMap.get(r.target_type) || 0) + 1);
    }
    reportsByType = reportsByType.map((r) => ({ ...r, count: typeMap.get(r.type) || 0 }));
    reportsTotalForRange = reportsByType.reduce((s, r) => s + r.count, 0);
  } catch { /* skip */ }

  return NextResponse.json({
    range: { from: fromDate, to: toDate },
    visitRange: { from: visitFromDate, to: visitToDate },
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
      ...visitsAgg,
    },
    topCategories,
    topPosts,
    reportAnalysis: {
      range: { from: reportFromDate, to: reportToDate },
      total: reportsTotalForRange,
      byType: reportsByType,
    },
  });
}
