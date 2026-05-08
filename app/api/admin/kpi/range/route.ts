import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAdminPassword } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

// POST /api/admin/kpi/range — 사용자 지정 기간(YYYY-MM-DD ~ YYYY-MM-DD) KPI
// body: { password, from, to }
export async function POST(request: Request) {
  const { password, from, to } = await request.json().catch(() => ({}));
  if (!(await verifyAdminPassword(password))) {
    return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
  }
  if (!from || !to) {
    return NextResponse.json({ error: "from/to 가 필요합니다" }, { status: 400 });
  }

  // from 00:00:00, to 23:59:59 UTC 변환 (서버 타임존이 UTC라고 가정 — 한국 시간대 클라가 보내면 약간 어긋날 수 있으나 일 단위 분석엔 충분)
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T23:59:59.999Z`);
  const fromIso = fromDate.toISOString();
  const toIso = toDate.toISOString();

  // 동일 길이의 이전 기간 — 비교용
  const periodMs = toDate.getTime() - fromDate.getTime();
  const prevToDate = new Date(fromDate.getTime() - 1);
  const prevFromDate = new Date(prevToDate.getTime() - periodMs);
  const prevFromIso = prevFromDate.toISOString();
  const prevToIso = prevToDate.toISOString();

  const countBetween = async (
    table: string,
    fromI: string,
    toI: string,
    dateCol = "created_at",
  ): Promise<number> => {
    const { count } = await (supabase as any)
      .from(table)
      .select("id", { count: "exact", head: true })
      .gte(dateCol, fromI)
      .lte(dateCol, toI);
    return count || 0;
  };
  const countIn = (table: string, dateCol = "created_at") =>
    countBetween(table, fromIso, toIso, dateCol);

  const countStore = async (store: "google_play" | "app_store"): Promise<number> => {
    const { count } = await (supabase as any)
      .from("store_clicks")
      .select("id", { count: "exact", head: true })
      .eq("store", store)
      .gte("created_at", fromIso)
      .lte("created_at", toIso);
    return count || 0;
  };

  const [
    posts,
    comments,
    jobs,
    trades,
    postLikes,
    commentLikes,
    postBookmarks,
    jobBookmarks,
    storeGoogle,
    storeApple,
    // 거래 비교용 — 이전 동일 기간
    tradesPrev,
    jobsPrev,
    postsPrev,
  ] = await Promise.all([
    countIn("posts"),
    countIn("comments"),
    countIn("job_posts"),
    countIn("trade_posts"),
    countIn("post_likes"),
    countIn("comment_likes"),
    countIn("post_bookmarks"),
    countIn("job_post_bookmarks"),
    countStore("google_play"),
    countStore("app_store"),
    countBetween("trade_posts", prevFromIso, prevToIso),
    countBetween("job_posts", prevFromIso, prevToIso),
    countBetween("posts", prevFromIso, prevToIso),
  ]);

  // 기간 일수 (양 끝 포함)
  const days = Math.max(1, Math.round(periodMs / (24 * 60 * 60 * 1000)) + 1);

  // 변화율 계산 — prev 가 0 이면 비교 불가(null), 그 외엔 % 정수
  const changePct = (cur: number, prev: number): number | null => {
    if (prev <= 0) return cur > 0 ? null : 0;
    return Math.round(((cur - prev) / prev) * 100);
  };

  return NextResponse.json({
    from,
    to,
    days,
    prev_from: prevFromIso.slice(0, 10),
    prev_to: prevToIso.slice(0, 10),
    posts,
    comments,
    jobs,
    trades,
    postLikes,
    commentLikes,
    postBookmarks,
    jobBookmarks,
    storeClicks: {
      google_play: storeGoogle,
      app_store: storeApple,
      total: storeGoogle + storeApple,
    },
    compare: {
      trades: { prev: tradesPrev, change_pct: changePct(trades, tradesPrev) },
      jobs: { prev: jobsPrev, change_pct: changePct(jobs, jobsPrev) },
      posts: { prev: postsPrev, change_pct: changePct(posts, postsPrev) },
    },
  });
}
