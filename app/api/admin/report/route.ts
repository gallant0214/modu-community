import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAdminPassword } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

type Period = "day" | "week" | "month";

function periodDays(p: Period): number {
  return p === "day" ? 1 : p === "week" ? 7 : 30;
}

// offset: 0 = 현재 기간, 1 = 직전 기간, 2 = 그 이전, ...
function getRange(period: Period, offset: number) {
  const days = periodDays(period);
  const now = new Date();
  // 오늘 00시 기준으로 기간 계산
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  // 현재 기간(offset=0)의 끝 = 지금, 시작 = today - (days-1)*86400000 의 00시
  // offset 단위로 days 일씩 뒤로 이동
  const endOffsetMs = offset * days * 86400000;
  const to = new Date(now.getTime() - endOffsetMs);
  const from = new Date(today.getTime() - (days - 1 + offset * days) * 86400000);
  return { from, to, days };
}

function dailyKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function metricRows(
  table: string,
  dateCol: string,
  from: Date,
  to: Date,
  extraFilter?: (q: any) => any,
): Promise<Date[]> {
  try {
    const sb = supabase as any;
    let q = sb.from(table).select(dateCol).gte(dateCol, from.toISOString()).lte(dateCol, to.toISOString());
    if (extraFilter) q = extraFilter(q);
    const { data } = await q.limit(50000);
    return (data || []).map((r: any) => new Date(r[dateCol]));
  } catch {
    return [];
  }
}

function aggregateDaily(rows: Date[], from: Date, days: number): { date: string; count: number }[] {
  const map = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(from.getTime() + i * 86400000);
    map.set(dailyKey(d), 0);
  }
  for (const r of rows) {
    const k = dailyKey(r);
    if (map.has(k)) map.set(k, (map.get(k) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));
}

function changePct(cur: number, prev: number): number {
  if (prev === 0) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 100);
}

async function buildMetric(
  table: string,
  dateCol: string,
  period: Period,
  offset: number,
  extraFilter?: (q: any) => any,
) {
  const cur = getRange(period, offset);
  const prev = getRange(period, offset + 1);
  const [curRows, prevRows] = await Promise.all([
    metricRows(table, dateCol, cur.from, cur.to, extraFilter),
    metricRows(table, dateCol, prev.from, prev.to, extraFilter),
  ]);
  return {
    current: curRows.length,
    previous: prevRows.length,
    changePct: changePct(curRows.length, prevRows.length),
    daily: aggregateDaily(curRows, cur.from, cur.days),
    prevDaily: aggregateDaily(prevRows, prev.from, prev.days),
  };
}

// 유입 채널 분류 (referrer 호스트명 기준) — KPI 라우트와 동일 규칙
function classifyChannel(ref: string | null | undefined): string {
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
  } catch { return "기타"; }
}

function extractKeyword(ref: string | null | undefined): string | null {
  if (!ref) return null;
  try {
    const u = new URL(ref);
    const params = u.searchParams;
    for (const k of ["query", "q", "wd", "search", "keyword"]) {
      const v = params.get(k);
      if (v && v.trim()) return v.trim().slice(0, 80);
    }
    return null;
  } catch { return null; }
}

async function inflowAnalysis(period: Period, offset: number) {
  const { from, to } = getRange(period, offset);
  try {
    const sb = supabase as any;
    const { data } = await sb.from("site_visits")
      .select("referrer")
      .gte("visited_at", from.toISOString())
      .lte("visited_at", to.toISOString())
      .limit(50000);
    const channelMap = new Map<string, number>();
    const keywordMap = new Map<string, number>();
    for (const row of data || []) {
      const ch = classifyChannel(row.referrer);
      channelMap.set(ch, (channelMap.get(ch) || 0) + 1);
      const kw = extractKeyword(row.referrer);
      if (kw) keywordMap.set(kw, (keywordMap.get(kw) || 0) + 1);
    }
    const totalCh = [...channelMap.values()].reduce((a, b) => a + b, 0) || 1;
    const channels = [...channelMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([name, count]) => ({ name, count, percent: Math.round((count / totalCh) * 1000) / 10 }));
    const totalKw = [...keywordMap.values()].reduce((a, b) => a + b, 0) || 1;
    const keywords = [...keywordMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([keyword, count]) => ({ keyword, count, percent: Math.round((count / totalKw) * 1000) / 10 }));
    return { channels, keywords };
  } catch { return { channels: [], keywords: [] }; }
}

async function topCategoriesInRange(period: Period, offset: number) {
  const { from, to } = getRange(period, offset);
  try {
    const sb = supabase as any;
    const { data } = await sb.from("posts").select("category_id")
      .gte("created_at", from.toISOString()).lte("created_at", to.toISOString()).limit(50000);
    const map = new Map<number, number>();
    for (const r of data || []) if (r.category_id) map.set(r.category_id, (map.get(r.category_id) || 0) + 1);
    const top = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (top.length === 0) return [];
    const ids = top.map(([id]) => id);
    const { data: cats } = await sb.from("categories").select("id, name").in("id", ids);
    const nameMap = new Map<number, string>((cats || []).map((c: any) => [c.id, c.name]));
    return top.map(([id, count]) => ({ name: nameMap.get(id) || `#${id}`, count }));
  } catch { return []; }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { password, period = "week", offset = 0 } = body;
  if (!(await verifyAdminPassword(password))) {
    return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
  }
  const p: Period = period === "day" || period === "month" ? period : "week";
  const off = Math.max(0, Number(offset) || 0);

  const [visits, signups, posts, comments, jobs, storeApp, storeGoogle, inflow, topCats] = await Promise.all([
    buildMetric("site_visits", "visited_at", p, off),
    buildMetric("nicknames", "created_at", p, off),
    buildMetric("posts", "created_at", p, off),
    buildMetric("comments", "created_at", p, off),
    buildMetric("job_posts", "created_at", p, off),
    buildMetric("store_clicks", "clicked_at", p, off, (q: any) => q.eq("store", "app_store")),
    buildMetric("store_clicks", "clicked_at", p, off, (q: any) => q.eq("store", "google_play")),
    inflowAnalysis(p, off),
    topCategoriesInRange(p, off),
  ]);

  // 스토어 클릭은 두 스토어 합산
  const storeClicks = {
    current: storeApp.current + storeGoogle.current,
    previous: storeApp.previous + storeGoogle.previous,
    changePct: 0,
    daily: storeApp.daily.map((d, i) => ({ date: d.date, count: d.count + (storeGoogle.daily[i]?.count || 0) })),
    prevDaily: storeApp.prevDaily.map((d, i) => ({ date: d.date, count: d.count + (storeGoogle.prevDaily[i]?.count || 0) })),
    appStore: storeApp.current,
    googlePlay: storeGoogle.current,
  };
  storeClicks.changePct = changePct(storeClicks.current, storeClicks.previous);

  const cur = getRange(p, off);
  const prev = getRange(p, off + 1);

  return NextResponse.json({
    period: p,
    offset: off,
    range: { from: cur.from.toISOString(), to: cur.to.toISOString(), days: cur.days },
    prevRange: { from: prev.from.toISOString(), to: prev.to.toISOString(), days: prev.days },
    metrics: { visits, signups, posts, comments, jobs, storeClicks },
    inflow,
    topCategories: topCats,
  });
}
