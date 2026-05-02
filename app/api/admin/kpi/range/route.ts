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
  const fromIso = new Date(`${from}T00:00:00.000Z`).toISOString();
  const toIso = new Date(`${to}T23:59:59.999Z`).toISOString();

  const countIn = async (table: string, dateCol = "created_at"): Promise<number> => {
    const { count } = await (supabase as any)
      .from(table)
      .select("id", { count: "exact", head: true })
      .gte(dateCol, fromIso)
      .lte(dateCol, toIso);
    return count || 0;
  };

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
    postLikes,
    commentLikes,
    postBookmarks,
    jobBookmarks,
    storeGoogle,
    storeApple,
  ] = await Promise.all([
    countIn("posts"),
    countIn("comments"),
    countIn("job_posts"),
    countIn("post_likes"),
    countIn("comment_likes"),
    countIn("post_bookmarks"),
    countIn("job_post_bookmarks"),
    countStore("google_play"),
    countStore("app_store"),
  ]);

  return NextResponse.json({
    from,
    to,
    posts,
    comments,
    jobs,
    postLikes,
    commentLikes,
    postBookmarks,
    jobBookmarks,
    storeClicks: {
      google_play: storeGoogle,
      app_store: storeApple,
      total: storeGoogle + storeApple,
    },
  });
}
