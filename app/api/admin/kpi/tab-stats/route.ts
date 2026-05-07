import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAdminPassword } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

type TabKey = "practical" | "community" | "jobs" | "trade";
type Platform = "web" | "ios" | "android";

interface TabRow {
  tab_key: TabKey;
  platform: Platform;
  duration_ms: number | null;
}

interface TabStat {
  visits: number;
  total_duration_ms: number;
  visits_with_duration: number;
}

const TABS: TabKey[] = ["practical", "community", "jobs", "trade"];
const PLATFORMS: Platform[] = ["web", "ios", "android"];

// POST /api/admin/kpi/tab-stats — 기간 받아 탭별/플랫폼별 방문수+평균 체류시간 집계
// body: { password, from, to }  (YYYY-MM-DD)
export async function POST(request: Request) {
  const { password, from, to } = await request.json().catch(() => ({}));
  if (!(await verifyAdminPassword(password))) {
    return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
  }
  if (!from || !to) {
    return NextResponse.json({ error: "from/to 가 필요합니다" }, { status: 400 });
  }

  const fromIso = new Date(`${from}T00:00:00.000Z`).toISOString();
  const toIso = new Date(`${to}T23:59:59.999Z`).toISOString();

  // 페이지네이션: 1000 row 씩 끌어오기 (Supabase 기본 limit)
  const PAGE = 1000;
  const rows: TabRow[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await (supabase as any)
      .from("tab_visits")
      .select("tab_key, platform, duration_ms")
      .gte("entered_at", fromIso)
      .lte("entered_at", toIso)
      .range(offset, offset + PAGE - 1);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as TabRow[]));
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  const empty = (): TabStat => ({ visits: 0, total_duration_ms: 0, visits_with_duration: 0 });
  const byTab: Record<TabKey, TabStat> = {
    practical: empty(), community: empty(), jobs: empty(), trade: empty(),
  };
  const byPlatform: Record<Platform, TabStat> = {
    web: empty(), ios: empty(), android: empty(),
  };
  const byTabPlatform: Record<string, TabStat> = {};

  for (const r of rows) {
    if (!TABS.includes(r.tab_key) || !PLATFORMS.includes(r.platform)) continue;
    byTab[r.tab_key].visits += 1;
    byPlatform[r.platform].visits += 1;
    const key = `${r.tab_key}__${r.platform}`;
    if (!byTabPlatform[key]) byTabPlatform[key] = empty();
    byTabPlatform[key].visits += 1;
    if (r.duration_ms != null && r.duration_ms > 0) {
      byTab[r.tab_key].total_duration_ms += r.duration_ms;
      byTab[r.tab_key].visits_with_duration += 1;
      byPlatform[r.platform].total_duration_ms += r.duration_ms;
      byPlatform[r.platform].visits_with_duration += 1;
      byTabPlatform[key].total_duration_ms += r.duration_ms;
      byTabPlatform[key].visits_with_duration += 1;
    }
  }

  const formatStat = (s: TabStat) => ({
    visits: s.visits,
    avg_duration_sec: s.visits_with_duration > 0
      ? Math.round(s.total_duration_ms / s.visits_with_duration / 1000)
      : 0,
    total_duration_sec: Math.round(s.total_duration_ms / 1000),
  });

  return NextResponse.json({
    from,
    to,
    total_visits: rows.length,
    by_tab: Object.fromEntries(TABS.map(t => [t, formatStat(byTab[t])])),
    by_platform: Object.fromEntries(PLATFORMS.map(p => [p, formatStat(byPlatform[p])])),
    by_tab_platform: Object.fromEntries(
      Object.entries(byTabPlatform).map(([k, v]) => [k, formatStat(v)])
    ),
  });
}
