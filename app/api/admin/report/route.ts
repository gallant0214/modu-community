import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAdminPassword } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

type Period = "day" | "week" | "month" | "custom";
type Range = { from: Date; to: Date; days: number };

// Vercel 서버는 UTC 라 모든 일자/시각 경계는 KST 기준으로 명시 변환.
const KST_OFFSET_MS = 9 * 3600 * 1000;

function periodDays(p: Exclude<Period, "custom">): number {
  return p === "day" ? 1 : p === "week" ? 7 : 30;
}

// 주어진 시점의 KST 자정을 UTC 시각으로 반환 (KST 의 그 날 00:00 = UTC 의 어제 15:00)
function kstStartOfDay(d: Date): Date {
  const k = new Date(d.getTime() + KST_OFFSET_MS);
  k.setUTCHours(0, 0, 0, 0);
  return new Date(k.getTime() - KST_OFFSET_MS);
}

// offset: 0 = 현재 기간, 1 = 직전 기간, 2 = 그 이전, ...
function getAutoRange(period: Exclude<Period, "custom">, offset: number): Range {
  const days = periodDays(period);
  const now = new Date();
  const today = kstStartOfDay(now);
  const endOffsetMs = offset * days * 86400000;
  const to = new Date(now.getTime() - endOffsetMs);
  const from = new Date(today.getTime() - (days - 1 + offset * days) * 86400000);
  return { from, to, days };
}

// custom 모드: customFrom~customTo 가 cur, 같은 길이의 직전이 prev (둘 다 KST 자정 기준)
function getCustomRanges(customFrom: string, customTo: string): { cur: Range; prev: Range } {
  const f = new Date(customFrom + "T00:00:00+09:00");
  const t = new Date(customTo + "T23:59:59+09:00");
  const days = Math.max(1, Math.round((t.getTime() - f.getTime()) / 86400000) + 1);
  const cur: Range = { from: f, to: t, days };
  const prevTo = new Date(f.getTime() - 1);
  const prevFrom = kstStartOfDay(new Date(prevTo.getTime() - (days - 1) * 86400000));
  // prevTo 는 KST 그 날 23:59:59 로 정렬
  const prevToKst = new Date(prevTo.getTime() + KST_OFFSET_MS);
  prevToKst.setUTCHours(23, 59, 59, 999);
  const prev: Range = { from: prevFrom, to: new Date(prevToKst.getTime() - KST_OFFSET_MS), days };
  return { cur, prev };
}

function resolveRanges(
  period: Period, offset: number, customFrom?: string, customTo?: string,
): { cur: Range; prev: Range } {
  if (period === "custom" && customFrom && customTo) {
    return getCustomRanges(customFrom, customTo);
  }
  const auto = period === "custom" ? "week" : period;
  return { cur: getAutoRange(auto, offset), prev: getAutoRange(auto, offset + 1) };
}

function dailyKey(d: Date): string {
  const k = new Date(d.getTime() + KST_OFFSET_MS);
  return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, "0")}-${String(k.getUTCDate()).padStart(2, "0")}`;
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
    // Supabase/PostgREST 기본 max-rows = 1000 으로 캡됨. .limit() 명시도 우회 못함.
    // range() 로 페이지네이션해 모든 row 회수 (~10만 까지 안전).
    const PAGE = 1000;
    const MAX_PAGES = 100; // 최대 10만 row 안전장치
    const result: Date[] = [];
    for (let p = 0; p < MAX_PAGES; p++) {
      let q = sb.from(table).select(dateCol)
        .gte(dateCol, from.toISOString())
        .lte(dateCol, to.toISOString())
        .order(dateCol, { ascending: true })
        .range(p * PAGE, p * PAGE + PAGE - 1);
      if (extraFilter) q = extraFilter(q);
      const { data } = await q;
      if (!data || data.length === 0) break;
      for (const r of data) result.push(new Date(r[dateCol]));
      if (data.length < PAGE) break;
    }
    return result;
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
  cur: Range,
  prev: Range,
  extraFilter?: (q: any) => any,
) {
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

async function inflowAnalysis(cur: Range) {
  const { from, to } = cur;
  try {
    const sb = supabase as any;
    // 1000-row cap 우회 (PostgREST max-rows) — 페이지네이션으로 전부 가져오기
    const PAGE = 1000;
    const MAX_PAGES = 100;
    const allRows: { referrer: string | null }[] = [];
    for (let p = 0; p < MAX_PAGES; p++) {
      const { data } = await sb.from("site_visits")
        .select("referrer")
        .gte("visited_at", from.toISOString())
        .lte("visited_at", to.toISOString())
        .range(p * PAGE, p * PAGE + PAGE - 1);
      if (!data || data.length === 0) break;
      allRows.push(...data);
      if (data.length < PAGE) break;
    }
    const channelMap = new Map<string, number>();
    const keywordMap = new Map<string, number>();
    for (const row of allRows) {
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

async function topCategoriesInRange(cur: Range) {
  const { from, to } = cur;
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
  const { password, period = "week", offset = 0, customFrom, customTo } = body;
  if (!(await verifyAdminPassword(password))) {
    return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
  }
  const validPeriods: Period[] = ["day", "week", "month", "custom"];
  const p: Period = validPeriods.includes(period) ? period : "week";
  const off = Math.max(0, Number(offset) || 0);

  // custom 모드는 customFrom/customTo 둘 다 있어야 함
  if (p === "custom" && (!customFrom || !customTo)) {
    return NextResponse.json({ error: "기간을 선택해주세요" }, { status: 400 });
  }

  const { cur, prev } = resolveRanges(p, off, customFrom, customTo);

  const [visits, signups, posts, comments, jobs, storeApp, storeGoogle, inflow, topCats] = await Promise.all([
    buildMetric("site_visits", "visited_at", cur, prev),
    buildMetric("nicknames", "created_at", cur, prev),
    buildMetric("posts", "created_at", cur, prev),
    buildMetric("comments", "created_at", cur, prev),
    buildMetric("job_posts", "created_at", cur, prev),
    buildMetric("store_clicks", "clicked_at", cur, prev, (q: any) => q.eq("store", "app_store")),
    buildMetric("store_clicks", "clicked_at", cur, prev, (q: any) => q.eq("store", "google_play")),
    inflowAnalysis(cur),
    topCategoriesInRange(cur),
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
