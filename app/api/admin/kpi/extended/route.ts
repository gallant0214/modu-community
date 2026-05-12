import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAdminPassword } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

// Supabase PostgREST max-rows 1000 우회용 페이지네이션 헬퍼
async function paginateAll<T = any>(
  buildQuery: () => any,
  pageSize = 1000,
  maxPages = 200,
): Promise<T[]> {
  const all: T[] = [];
  for (let p = 0; p < maxPages; p++) {
    const { data } = await buildQuery().range(p * pageSize, p * pageSize + pageSize - 1);
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < pageSize) break;
  }
  return all;
}

const DAY_MS = 24 * 3600 * 1000;
const dayKey = (d: Date) => {
  const k = new Date(d.getTime() + 9 * 3600 * 1000); // KST
  return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, "0")}-${String(k.getUTCDate()).padStart(2, "0")}`;
};

/**
 * POST /api/admin/kpi/extended
 * body: { password, from?: ISO, to?: ISO }
 *
 * 운영·마케팅 관점의 추가 지표 통합:
 *  - retention      D1/D7/D30 (가입 후 N일째에 로그인 1건 이상)
 *  - dau            기간 내 distinct firebase_uid (user_login_log)
 *  - wau / mau      최근 7일 / 30일 distinct uid
 *  - activationFunnel  가입 후 7일 내 첫 글/댓글/거래글 작성 비율
 *  - dormancy       7일/30일/90일 미접속 사용자 수 (기준: user_login_log 의 latest signed_in_at)
 *  - pushStats      알림 OFF 비율(notify_*) + 발송/클릭 (CTR)
 *  - reportReasons  reports.reason 분포 + 처리 평균 시간
 *  - tradeFunnel    active/reserved/sold 분포 + 평균 머문 일수
 *  - jobEffect      평균 조회·북마크·모집종료까지 일수
 *  - searchKeywords 검색어 top + 0건 결과 검색
 *  - blocksMost     차단 가장 많이 받는 사용자 top
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { password, from, to } = body;
  if (!(await verifyAdminPassword(password))) {
    return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
  }

  const sb = supabase as any;
  const now = Date.now();
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  const fromIso = fromDate?.toISOString();
  const toIso = toDate?.toISOString();

  // ───────── 1) Retention (D1/D7/D30) ─────────
  // 가입자 표본: nicknames (placeholder 제외) 의 created_at
  // 로그인 표본: user_login_log
  // D1 = 가입 후 1~2일 사이에 로그인 1건 이상
  // D7 = 가입 후 6~8일 사이에 로그인 1건 이상 (±1일 여유)
  // D30 = 가입 후 28~32일 사이에 로그인 1건 이상
  async function computeRetention() {
    try {
      // 가입자 (시간 범위 — D30 평가를 위해 최소 30일 전까지의 가입자를 포함해야 함.
      // from 이 주어지면 그 범위 + 더 과거(30일) 포함.
      const cohortFromIso = fromIso || new Date(now - 90 * DAY_MS).toISOString();
      const cohortToIso = toIso || new Date(now).toISOString();
      const users = await paginateAll<{ firebase_uid: string; created_at: string }>(() =>
        sb.from("nicknames")
          .select("firebase_uid, created_at")
          .not("name", "ilike", "__pending_%")
          .not("firebase_uid", "is", null)
          .gte("created_at", cohortFromIso)
          .lte("created_at", cohortToIso),
      );
      if (users.length === 0) {
        return { d1: { retained: 0, total: 0, rate: 0 }, d7: { retained: 0, total: 0, rate: 0 }, d30: { retained: 0, total: 0, rate: 0 } };
      }

      // 로그인 데이터 — 가입자 평균 + 30일 + 2일 정도
      const minCreatedAt = Math.min(...users.map((u) => new Date(u.created_at).getTime()));
      const loginRangeStartIso = new Date(minCreatedAt).toISOString();
      const loginRangeEndIso = new Date(now).toISOString();
      const logins = await paginateAll<{ firebase_uid: string; signed_in_at: string }>(() =>
        sb.from("user_login_log")
          .select("firebase_uid, signed_in_at")
          .gte("signed_in_at", loginRangeStartIso)
          .lte("signed_in_at", loginRangeEndIso),
      );
      // uid → 로그인 시각 Set (Date.getTime())
      const loginsByUid = new Map<string, number[]>();
      for (const l of logins) {
        const t = new Date(l.signed_in_at).getTime();
        const arr = loginsByUid.get(l.firebase_uid) || [];
        arr.push(t);
        loginsByUid.set(l.firebase_uid, arr);
      }

      const tally = (dayN: number, window: number) => {
        let eligible = 0, retained = 0;
        const minWindow = dayN * DAY_MS;
        const maxWindow = (dayN + window) * DAY_MS;
        for (const u of users) {
          const created = new Date(u.created_at).getTime();
          // 평가 가능한 가입자: 가입 후 dayN+window일이 이미 경과한 가입자
          if (now - created < maxWindow) continue;
          eligible++;
          const logins = loginsByUid.get(u.firebase_uid) || [];
          const hit = logins.some((t) => t - created >= minWindow && t - created <= maxWindow);
          if (hit) retained++;
        }
        return {
          total: eligible,
          retained,
          rate: eligible > 0 ? Math.round((retained / eligible) * 1000) / 10 : 0,
        };
      };
      // D1 = 가입 후 1~2일, D7 = 가입 후 7~8일, D30 = 가입 후 30~32일 (윈도우 ±2일)
      return { d1: tally(1, 1), d7: tally(7, 1), d30: tally(30, 2) };
    } catch (e) {
      console.error("[retention] failed:", e);
      return { d1: { retained: 0, total: 0, rate: 0 }, d7: { retained: 0, total: 0, rate: 0 }, d30: { retained: 0, total: 0, rate: 0 } };
    }
  }

  // ───────── 2) DAU/WAU/MAU ─────────
  // 기간 미지정 시: 어제 DAU, 최근 7일 WAU, 최근 30일 MAU.
  // 기간 지정 시: 그 범위의 distinct uid 카운트만 (사용자가 의도한 mass-active 측정)
  async function computeActives() {
    try {
      const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0); dayStart.setUTCHours(dayStart.getUTCHours() - 9);
      const wauStart = new Date(now - 7 * DAY_MS);
      const mauStart = new Date(now - 30 * DAY_MS);
      const fetchDistinct = async (sinceIso: string) => {
        const rows = await paginateAll<{ firebase_uid: string }>(() =>
          sb.from("user_login_log").select("firebase_uid").gte("signed_in_at", sinceIso),
        );
        return new Set(rows.map((r) => r.firebase_uid).filter(Boolean)).size;
      };
      const [dau, wau, mau] = await Promise.all([
        fetchDistinct(dayStart.toISOString()),
        fetchDistinct(wauStart.toISOString()),
        fetchDistinct(mauStart.toISOString()),
      ]);
      // 사용자 지정 기간 (옵션)
      let rangeActive: number | null = null;
      if (fromIso && toIso) {
        const rows = await paginateAll<{ firebase_uid: string }>(() =>
          sb.from("user_login_log")
            .select("firebase_uid")
            .gte("signed_in_at", fromIso)
            .lte("signed_in_at", toIso),
        );
        rangeActive = new Set(rows.map((r) => r.firebase_uid).filter(Boolean)).size;
      }
      return { dau, wau, mau, rangeActive };
    } catch (e) {
      console.error("[actives] failed:", e);
      return { dau: 0, wau: 0, mau: 0, rangeActive: null };
    }
  }

  // ───────── 3) 활성화 펀널 (가입 후 7일 내 첫 활동) ─────────
  async function computeActivationFunnel() {
    try {
      const sevenDaysAgoIso = new Date(now - 7 * DAY_MS).toISOString();
      const cohortFromIso = fromIso || new Date(now - 90 * DAY_MS).toISOString();
      const cohortToIso = toIso || sevenDaysAgoIso; // 평가 가능한 가입자 (7일 경과한)
      const users = await paginateAll<{ firebase_uid: string; created_at: string }>(() =>
        sb.from("nicknames")
          .select("firebase_uid, created_at")
          .not("name", "ilike", "__pending_%")
          .not("firebase_uid", "is", null)
          .gte("created_at", cohortFromIso)
          .lte("created_at", cohortToIso),
      );
      const total = users.length;
      if (total === 0) return { total: 0, post: 0, comment: 0, trade: 0, postRate: 0, commentRate: 0, tradeRate: 0 };
      const userMap = new Map(users.map((u) => [u.firebase_uid, new Date(u.created_at).getTime()]));

      const tableCheck = async (table: string) => {
        const rows = await paginateAll<{ firebase_uid: string; created_at: string }>(() =>
          sb.from(table).select("firebase_uid, created_at").in("firebase_uid", users.map((u) => u.firebase_uid)),
        );
        const setOfActivated = new Set<string>();
        for (const r of rows) {
          const createdAt = userMap.get(r.firebase_uid);
          if (createdAt && new Date(r.created_at).getTime() - createdAt <= 7 * DAY_MS) {
            setOfActivated.add(r.firebase_uid);
          }
        }
        return setOfActivated.size;
      };
      const [postActivated, commentActivated, tradeActivated] = await Promise.all([
        tableCheck("posts"),
        tableCheck("comments"),
        tableCheck("trade_posts"),
      ]);
      return {
        total,
        post: postActivated,
        comment: commentActivated,
        trade: tradeActivated,
        postRate: Math.round((postActivated / total) * 1000) / 10,
        commentRate: Math.round((commentActivated / total) * 1000) / 10,
        tradeRate: Math.round((tradeActivated / total) * 1000) / 10,
      };
    } catch (e) {
      console.error("[funnel] failed:", e);
      return { total: 0, post: 0, comment: 0, trade: 0, postRate: 0, commentRate: 0, tradeRate: 0 };
    }
  }

  // ───────── 4) 휴면 분포 (마지막 로그인 기준) ─────────
  async function computeDormancy() {
    try {
      const logins = await paginateAll<{ firebase_uid: string; signed_in_at: string }>(() =>
        sb.from("user_login_log").select("firebase_uid, signed_in_at").order("signed_in_at", { ascending: false }),
      );
      const latest = new Map<string, number>();
      for (const l of logins) {
        const t = new Date(l.signed_in_at).getTime();
        const cur = latest.get(l.firebase_uid);
        if (cur === undefined || t > cur) latest.set(l.firebase_uid, t);
      }
      let active7 = 0, dormant7 = 0, dormant30 = 0, dormant90 = 0;
      for (const [, t] of latest) {
        const age = now - t;
        if (age < 7 * DAY_MS) active7++;
        else if (age < 30 * DAY_MS) dormant7++;
        else if (age < 90 * DAY_MS) dormant30++;
        else dormant90++;
      }
      return {
        usersWithLogin: latest.size,
        active7,        // 최근 7일 내 로그인
        dormant7,       // 7~30일 미접속
        dormant30,      // 30~90일 미접속
        dormant90,      // 90일+ 미접속
      };
    } catch (e) {
      console.error("[dormancy] failed:", e);
      return { usersWithLogin: 0, active7: 0, dormant7: 0, dormant30: 0, dormant90: 0 };
    }
  }

  // ───────── 5) 푸시 통계 (CTR + OFF 비율) ─────────
  async function computePushStats() {
    try {
      const dRange = (q: any) => {
        if (fromIso) q = q.gte("created_at", fromIso);
        if (toIso) q = q.lte("created_at", toIso);
        return q;
      };
      const dRangeClicks = (q: any) => {
        if (fromIso) q = q.gte("clicked_at", fromIso);
        if (toIso) q = q.lte("clicked_at", toIso);
        return q;
      };
      // 발송 (admin_broadcasts.sent_count 합산)
      const broadcasts = await paginateAll<{ id: number; broadcast_type: string; sent_count: number | null; fail_count: number | null; created_at: string }>(() =>
        dRange(sb.from("admin_broadcasts").select("id, broadcast_type, sent_count, fail_count, created_at")),
      );
      const sentTotal = broadcasts.reduce((s, b) => s + (b.sent_count || 0), 0);
      const failTotal = broadcasts.reduce((s, b) => s + (b.fail_count || 0), 0);
      // 클릭
      const clicks = await paginateAll<{ type: string; broadcast_id: number | null }>(() =>
        dRangeClicks(sb.from("push_clicks").select("type, broadcast_id")),
      );
      const clickTotal = clicks.length;
      // 알림 OFF 비율
      const prefs = await paginateAll<Record<string, any>>(() =>
        sb.from("notification_preferences").select("notify_comment, notify_reply, notify_like, notify_job, notify_trade, notify_notice, notify_promo, notify_keyword, notify_message"),
      );
      const totalPrefs = prefs.length || 1;
      const countOff = (key: string) => prefs.filter((p) => p[key] === false).length;
      const offRates: Record<string, { off: number; rate: number }> = {};
      for (const key of ["notify_comment","notify_reply","notify_like","notify_job","notify_trade","notify_notice","notify_promo","notify_keyword","notify_message"]) {
        const off = countOff(key);
        offRates[key] = { off, rate: Math.round((off / totalPrefs) * 1000) / 10 };
      }
      return {
        sent: sentTotal,
        failed: failTotal,
        clicked: clickTotal,
        ctr: sentTotal > 0 ? Math.round((clickTotal / sentTotal) * 1000) / 10 : 0,
        prefsTotal: prefs.length,
        offRates,
      };
    } catch (e) {
      console.error("[pushStats] failed:", e);
      return { sent: 0, failed: 0, clicked: 0, ctr: 0, prefsTotal: 0, offRates: {} };
    }
  }

  // ───────── 6) 신고 사유 분포 ─────────
  async function computeReportReasons() {
    try {
      const dRange = (q: any) => {
        if (fromIso) q = q.gte("created_at", fromIso);
        if (toIso) q = q.lte("created_at", toIso);
        return q;
      };
      const rows = await paginateAll<{ target_type: string; reason: string; resolved: boolean; resolved_at: string | null; created_at: string }>(() =>
        dRange(sb.from("reports").select("target_type, reason, resolved, resolved_at, created_at")),
      );
      const reasonMap = new Map<string, number>();
      let resolvedCount = 0, resolveSumMs = 0;
      for (const r of rows) {
        const key = r.reason?.slice(0, 60) || "(미입력)";
        reasonMap.set(key, (reasonMap.get(key) || 0) + 1);
        if (r.resolved && r.resolved_at && r.created_at) {
          const dur = new Date(r.resolved_at).getTime() - new Date(r.created_at).getTime();
          if (dur >= 0) { resolvedCount++; resolveSumMs += dur; }
        }
      }
      const reasons = [...reasonMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
        .map(([reason, count]) => ({ reason, count }));
      const avgResolveHours = resolvedCount > 0 ? Math.round((resolveSumMs / resolvedCount / 3600000) * 10) / 10 : 0;
      return { total: rows.length, reasons, avgResolveHours };
    } catch (e) {
      console.error("[reportReasons] failed:", e);
      return { total: 0, reasons: [], avgResolveHours: 0 };
    }
  }

  // ───────── 7) 거래 funnel (active/reserved/sold + 평균 머문 일수) ─────────
  async function computeTradeFunnel() {
    try {
      const dRange = (q: any) => {
        if (fromIso) q = q.gte("created_at", fromIso);
        if (toIso) q = q.lte("created_at", toIso);
        return q;
      };
      const rows = await paginateAll<{ status: string; created_at: string; updated_at: string | null; price_manwon: number | null }>(() =>
        dRange(sb.from("trade_posts").select("status, created_at, updated_at, price_manwon")),
      );
      const byStatus: Record<string, number> = { active: 0, reserved: 0, sold: 0, hidden: 0, deleted: 0 };
      let stale30 = 0; // active 30일 이상
      for (const r of rows) {
        byStatus[r.status] = (byStatus[r.status] || 0) + 1;
        if (r.status === "active" && r.created_at) {
          if (now - new Date(r.created_at).getTime() > 30 * DAY_MS) stale30++;
        }
      }
      const total = rows.length;
      const soldRate = total > 0 ? Math.round((byStatus.sold / total) * 1000) / 10 : 0;
      return { total, byStatus, soldRate, stale30 };
    } catch (e) {
      console.error("[tradeFunnel] failed:", e);
      return { total: 0, byStatus: {}, soldRate: 0, stale30: 0 };
    }
  }

  // ───────── 8) 구인 효과 ─────────
  async function computeJobEffect() {
    try {
      const dRange = (q: any) => {
        if (fromIso) q = q.gte("created_at", fromIso);
        if (toIso) q = q.lte("created_at", toIso);
        return q;
      };
      const rows = await paginateAll<{ is_closed: boolean | null; created_at: string; updated_at: string | null; views: number | null; bookmark_count: number | null }>(() =>
        dRange(sb.from("job_posts").select("is_closed, created_at, updated_at, views, bookmark_count")),
      );
      const total = rows.length;
      const closed = rows.filter((r) => r.is_closed === true).length;
      const open = total - closed;
      let viewSum = 0, bmSum = 0, closeDurSum = 0, closeDurCount = 0;
      for (const r of rows) {
        viewSum += r.views || 0;
        bmSum += r.bookmark_count || 0;
        if (r.is_closed && r.updated_at && r.created_at) {
          const dur = new Date(r.updated_at).getTime() - new Date(r.created_at).getTime();
          if (dur >= 0) { closeDurSum += dur; closeDurCount++; }
        }
      }
      return {
        total,
        open,
        closed,
        closeRate: total > 0 ? Math.round((closed / total) * 1000) / 10 : 0,
        avgViews: total > 0 ? Math.round((viewSum / total) * 10) / 10 : 0,
        avgBookmarks: total > 0 ? Math.round((bmSum / total) * 10) / 10 : 0,
        avgCloseDays: closeDurCount > 0 ? Math.round((closeDurSum / closeDurCount / DAY_MS) * 10) / 10 : 0,
      };
    } catch (e) {
      console.error("[jobEffect] failed:", e);
      return { total: 0, open: 0, closed: 0, closeRate: 0, avgViews: 0, avgBookmarks: 0, avgCloseDays: 0 };
    }
  }

  // ───────── 9) 검색어 분석 ─────────
  async function computeSearchKeywords() {
    try {
      const dRange = (q: any) => {
        if (fromIso) q = q.gte("created_at", fromIso);
        if (toIso) q = q.lte("created_at", toIso);
        return q;
      };
      const rows = await paginateAll<{ query: string; scope: string; result_count: number | null }>(() =>
        dRange(sb.from("search_logs").select("query, scope, result_count")),
      );
      const byScope: Record<string, Map<string, number>> = {
        community: new Map(), jobs: new Map(), trade: new Map(),
      };
      const zeroResultMap = new Map<string, number>();
      for (const r of rows) {
        if (byScope[r.scope]) {
          const m = byScope[r.scope];
          m.set(r.query, (m.get(r.query) || 0) + 1);
        }
        if (r.result_count === 0) {
          zeroResultMap.set(r.query, (zeroResultMap.get(r.query) || 0) + 1);
        }
      }
      const top = (m: Map<string, number>) =>
        [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => ({ keyword: k, count: v }));
      return {
        total: rows.length,
        community: top(byScope.community),
        jobs: top(byScope.jobs),
        trade: top(byScope.trade),
        zeroResult: top(zeroResultMap),
      };
    } catch (e) {
      console.error("[search] failed:", e);
      return { total: 0, community: [], jobs: [], trade: [], zeroResult: [] };
    }
  }

  // ───────── 10) 차단 가장 많이 받은 사용자 ─────────
  async function computeMostBlocked() {
    try {
      const rows = await paginateAll<{ blocked_nickname: string | null; blocked_uid: string | null }>(() =>
        sb.from("user_blocks").select("blocked_nickname, blocked_uid"),
      );
      const map = new Map<string, number>();
      for (const r of rows) {
        const key = r.blocked_nickname || r.blocked_uid || "(unknown)";
        map.set(key, (map.get(key) || 0) + 1);
      }
      const top = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([nickname, count]) => ({ nickname, count }));
      return { total: rows.length, top };
    } catch (e) {
      console.error("[blocks] failed:", e);
      return { total: 0, top: [] };
    }
  }

  // 병렬 실행
  const [retention, actives, funnel, dormancy, pushStats, reportReasons, tradeFunnel, jobEffect, searchKeywords, mostBlocked] = await Promise.all([
    computeRetention(),
    computeActives(),
    computeActivationFunnel(),
    computeDormancy(),
    computePushStats(),
    computeReportReasons(),
    computeTradeFunnel(),
    computeJobEffect(),
    computeSearchKeywords(),
    computeMostBlocked(),
  ]);

  return NextResponse.json({
    range: { from: fromIso || null, to: toIso || null },
    retention,
    actives,
    activationFunnel: funnel,
    dormancy,
    pushStats,
    reportReasons,
    tradeFunnel,
    jobEffect,
    searchKeywords,
    mostBlocked,
  });
}
