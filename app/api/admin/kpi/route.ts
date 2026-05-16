import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAdminPassword } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

// Supabase / PostgREST 기본 max-rows = 1000.
// .limit(N>1000) 명시도 우회 못해서, 큰 데이터 인메모리 집계는 항상 페이지네이션 필요.
// 사용처: visit unique ip, 일별/시간별/요일별 차트, 활성 작성자 distinct uid, 인기 종목, 활동 지역 분포, 신고 분석.
async function paginateAll<T = any>(buildQuery: () => any, pageSize = 1000, maxPages = 200): Promise<T[]> {
  const all: T[] = [];
  for (let p = 0; p < maxPages; p++) {
    const { data } = await buildQuery().range(p * pageSize, p * pageSize + pageSize - 1);
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < pageSize) break;
  }
  return all;
}

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

  // 사용자 카운트는 USER 탭(/api/admin/users/list) 과 동일 필터 적용:
  // - placeholder 닉네임(__pending_*) 제외
  // - firebase_uid NULL 제외 (Firebase Auth 가입 없이 닉네임만 만든 옛 행)
  // 그래야 KPI 의 "전체 가입자" 와 USER 탭의 "총 N명" 이 일치한다.
  const usersFilter = (q: any) =>
    q.not("name", "ilike", "__pending_%").not("firebase_uid", "is", null);

  // 병렬 쿼리
  const [
    usersTotal, usersInRange,
    postsTotal, postsInRange,
    commentsTotal, commentsInRange,
    jobsTotal, jobsOpen, jobsClosed, jobsInRange,
    tradesTotal, tradesEquipTotal, tradesCenterTotal, tradesGearTotal, tradesInRange, tradesEquipInRange, tradesCenterInRange, tradesGearInRange,
    tradeBookmarksTotal, tradeBookmarksInRange,
    reportsTotal, reportsPending, reportsInRange,
    inquiriesTotal, inquiriesPending, inquiriesInRange,
    postLikesTotal, postLikesInRange,
    commentLikesTotal, commentLikesInRange,
    postBookmarksTotal, postBookmarksInRange,
    jobBookmarksTotal, jobBookmarksInRange,
    storeAppTotal, storeAppRange, storeGoogleTotal, storeGoogleRange,
    visitsTotal, visitsInRange, uniqueVisitorsRange,
  ] = await Promise.all([
    // 사용자 — USER 탭과 동일 필터
    (async () => {
      try {
        const { count } = await usersFilter(sb.from("nicknames").select("*", { count: "exact", head: true }));
        return count ?? 0;
      } catch { return 0; }
    })(),
    countRange("nicknames", "created_at", usersFilter),
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
    // 거래글 (status='active' 만 카운트, 'deleted' 는 제외)
    countAll("trade_posts"),
    (async () => {
      try {
        const { count } = await sb.from("trade_posts").select("*", { count: "exact", head: true }).eq("category", "equipment");
        return count ?? 0;
      } catch { return 0; }
    })(),
    (async () => {
      try {
        const { count } = await sb.from("trade_posts").select("*", { count: "exact", head: true }).eq("category", "center");
        return count ?? 0;
      } catch { return 0; }
    })(),
    (async () => {
      try {
        const { count } = await sb.from("trade_posts").select("*", { count: "exact", head: true }).eq("category", "gear");
        return count ?? 0;
      } catch { return 0; }
    })(),
    countRange("trade_posts"),
    countRange("trade_posts", "created_at", (q) => q.eq("category", "equipment")),
    countRange("trade_posts", "created_at", (q) => q.eq("category", "center")),
    countRange("trade_posts", "created_at", (q) => q.eq("category", "gear")),
    // 거래 북마크
    countAll("trade_post_bookmarks"),
    countRange("trade_post_bookmarks"),
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
        const data = await paginateAll<{ ip_hash: string | null }>(() => {
          let q = sb.from("site_visits").select("ip_hash").not("ip_hash", "is", null);
          if (visitFromDate) q = q.gte("visited_at", visitFromDate);
          if (visitToDate) q = q.lte("visited_at", visitToDate);
          return q;
        });
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
      const data = await paginateAll<{ visited_at: string; referrer: string | null }>(() => {
        let q = sb.from("site_visits").select("visited_at, referrer").order("visited_at", { ascending: true });
        if (visitFromDate) q = q.gte("visited_at", visitFromDate);
        if (visitToDate) q = q.lte("visited_at", visitToDate);
        return q;
      });

      // Vercel 서버는 UTC. 사용자에게 보여줄 시간/요일/날짜는 KST(UTC+9) 기준으로 추출.
      const KST_OFFSET_MS = 9 * 3600 * 1000;
      const kstParts = (d: Date) => {
        const k = new Date(d.getTime() + KST_OFFSET_MS);
        return {
          hour: k.getUTCHours(),
          weekday: k.getUTCDay(),
          dateKey: `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, "0")}-${String(k.getUTCDate()).padStart(2, "0")}`,
        };
      };

      // 0회 날도 차트에 표시되도록 기간 내 모든 날짜(KST)를 0 으로 미리 채움
      const dayMap = new Map<string, number>();
      if (visitFromDate && visitToDate) {
        const startKey = kstParts(new Date(visitFromDate)).dateKey;
        const endKey = kstParts(new Date(visitToDate)).dateKey;
        const [sy, sm, sd] = startKey.split("-").map(Number);
        const [ey, em, ed] = endKey.split("-").map(Number);
        let cursor = Date.UTC(sy, sm - 1, sd);
        const endTime = Date.UTC(ey, em - 1, ed);
        while (cursor <= endTime) {
          const c = new Date(cursor);
          const k = `${c.getUTCFullYear()}-${String(c.getUTCMonth() + 1).padStart(2, "0")}-${String(c.getUTCDate()).padStart(2, "0")}`;
          dayMap.set(k, 0);
          cursor += 86400000;
        }
      }

      if (!data || data.length === 0) {
        // 데이터 없어도 0 채워진 dailyChart 는 반환 (빈 차트 대신 0 라인 표시)
        const dailyChart = [...dayMap.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([date, count]) => ({ date, count }));
        return { ...empty, dailyChart };
      }

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
        const { hour, weekday, dateKey } = kstParts(dt);
        // 미리 채운 키만 카운트 (기간 밖 데이터 안전 무시)
        if (dayMap.has(dateKey)) dayMap.set(dateKey, (dayMap.get(dateKey) || 0) + 1);
        else dayMap.set(dateKey, 1);
        hourArr[hour]++;
        wkArr[weekday]++;
        const ch = classifyChannel(row.referrer);
        // localhost / 사설 IP / .local 채널은 관리자 dev 트래픽 — 집계 제외 (사용자 명시 요구)
        const isLocalChannel = /^(localhost|127\.0\.0\.1|::1|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(ch)
          || ch.endsWith(".local");
        if (!isLocalChannel) {
          channelMap.set(ch, (channelMap.get(ch) || 0) + 1);
        }
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
    const pRows = await paginateAll<{ firebase_uid: string | null }>(() => {
      let q = sb.from("posts").select("firebase_uid").not("firebase_uid", "is", null);
      if (fromDate) q = q.gte("created_at", fromDate);
      if (toDate) q = q.lte("created_at", toDate);
      return q;
    });
    activePostersInRange = new Set(pRows.map((r) => r.firebase_uid).filter(Boolean) as string[]).size;

    const cRows = await paginateAll<{ firebase_uid: string | null }>(() => {
      let q = sb.from("comments").select("firebase_uid").not("firebase_uid", "is", null);
      if (fromDate) q = q.gte("created_at", fromDate);
      if (toDate) q = q.lte("created_at", toDate);
      return q;
    });
    activeCommentersInRange = new Set(cRows.map((r) => r.firebase_uid).filter(Boolean) as string[]).size;
  } catch { /* skip */ }

  // 인기 종목 (기간 내 게시글 수 기준 top 5)
  let topCategories: { name: string; count: number }[] = [];
  try {
    const pRows = await paginateAll<{ category_id: number | null }>(() => {
      let q = sb.from("posts").select("category_id");
      if (fromDate) q = q.gte("created_at", fromDate);
      if (toDate) q = q.lte("created_at", toDate);
      return q;
    });
    const map = new Map<number, number>();
    for (const r of pRows) {
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

  // 활동 지역 분포 (시·도 / 시·군·구) — 마케팅용
  type RegionEntry = { name: string; count: number; percent: number };
  type RegionAgg = {
    total: number;       // active_region_name 설정한 사용자 수
    unset: number;       // 지역 미설정 사용자 수
    groups: RegionEntry[];           // 시·군·구 top 15
    groupsByProvince: RegionEntry[]; // 시·도 전체
  };
  const aggregateRegions = (rows: { active_region_name: string | null }[]): RegionAgg => {
    let total = 0, unset = 0;
    const detail = new Map<string, number>();
    const province = new Map<string, number>();
    for (const r of rows || []) {
      const region = r.active_region_name;
      if (!region) { unset++; continue; }
      total++;
      detail.set(region, (detail.get(region) || 0) + 1);
      const p = region.split(" - ")[0]?.trim() || region;
      province.set(p, (province.get(p) || 0) + 1);
    }
    const denom = total || 1;
    const groups = [...detail.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
      .map(([name, count]) => ({ name, count, percent: Math.round((count / denom) * 1000) / 10 }));
    const groupsByProvince = [...province.entries()].sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count, percent: Math.round((count / denom) * 1000) / 10 }));
    return { total, unset, groups, groupsByProvince };
  };
  let regionsTotal: RegionAgg = { total: 0, unset: 0, groups: [], groupsByProvince: [] };
  let regionsInRange: RegionAgg | null = null;
  try {
    const allRows = await paginateAll<{ active_region_name: string | null }>(() =>
      sb.from("nicknames")
        .select("active_region_name")
        .not("name", "ilike", "__pending_%")
        .not("firebase_uid", "is", null)
    );
    regionsTotal = aggregateRegions(allRows);
    if (fromDate || toDate) {
      const pRows = await paginateAll<{ active_region_name: string | null }>(() => {
        let q = sb.from("nicknames")
          .select("active_region_name")
          .not("name", "ilike", "__pending_%")
          .not("firebase_uid", "is", null);
        if (fromDate) q = q.gte("created_at", fromDate);
        if (toDate) q = q.lte("created_at", toDate);
        return q;
      });
      regionsInRange = aggregateRegions(pRows);
    }
  } catch { /* skip */ }

  // 신고 분석: target_type 별 누적 신고 카운트 (처리·삭제 무관 — '신고가 들어온 시점' 기준 통계)
  let reportsByType: { type: string; label: string; count: number }[] = [
    { type: "post", label: "게시물 신고", count: 0 },
    { type: "comment", label: "댓글 신고", count: 0 },
    { type: "job", label: "구인글 신고", count: 0 },
    { type: "message", label: "쪽지 신고", count: 0 },
  ];
  let reportsTotalForRange = 0;
  try {
    const data = await paginateAll<{ target_type: string | null }>(() => {
      let q = sb.from("reports").select("target_type");
      if (reportFromDate) q = q.gte("created_at", reportFromDate);
      if (reportToDate) q = q.lte("created_at", reportToDate);
      return q;
    });
    const typeMap = new Map<string, number>();
    for (const r of data) {
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
    trades: {
      total: tradesTotal,
      equipmentTotal: tradesEquipTotal,
      centerTotal: tradesCenterTotal,
      gearTotal: tradesGearTotal,
      inRange: tradesInRange,
      equipmentInRange: tradesEquipInRange,
      centerInRange: tradesCenterInRange,
      gearInRange: tradesGearInRange,
      bookmarksTotal: tradeBookmarksTotal,
      bookmarksInRange: tradeBookmarksInRange,
    },
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
    regions: {
      total: regionsTotal,
      inRange: regionsInRange,
    },
    reportAnalysis: {
      range: { from: reportFromDate, to: reportToDate },
      total: reportsTotalForRange,
      byType: reportsByType,
    },
  });
}
