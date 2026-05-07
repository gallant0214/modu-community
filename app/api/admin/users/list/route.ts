export const dynamic = "force-dynamic";

import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAdminPassword } from "@/app/lib/admin-auth";
import { getAuth } from "firebase-admin/auth";
import "@/app/lib/firebase-admin";

// POST /api/admin/users/list
// body: { password, page=1, limit=30 }
// 전체 닉네임 목록 + 활동 카운트 + 이메일 (30명/페이지). 정렬: 가입(닉네임 created_at) 최신순.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { password, page: pageRaw, limit: limitRaw } = body as {
    password?: string;
    page?: number;
    limit?: number;
  };
  if (!(await verifyAdminPassword(password || ""))) {
    return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
  }

  const page = Math.max(1, Number(pageRaw) || 1);
  const limit = Math.min(100, Math.max(1, Number(limitRaw) || 30));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const sb = supabase as any;

  // 1) 닉네임 페이지 — placeholder(__pending_*) 제외, 가입 최신순
  const { data: rows, count, error } = await sb
    .from("nicknames")
    .select("name, firebase_uid, created_at, changed_at, active_region_name", { count: "exact" })
    .not("name", "ilike", "__pending_%")
    .not("firebase_uid", "is", null)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = (rows || []) as Array<{
    name: string;
    firebase_uid: string;
    created_at: string | null;
    changed_at: string | null;
    active_region_name: string | null;
  }>;
  const uids = list.map((r) => r.firebase_uid).filter(Boolean) as string[];

  if (uids.length === 0) {
    return NextResponse.json({ users: [], total: count ?? 0, page, limit, totalPages: 0 });
  }

  // 2) 활동 카운트 병렬 — 각 테이블에서 firebase_uid 만 select 후 JS group-by.
  //    카운팅 기준은 firebase_uid (= 이메일과 1:1 매핑된 영구 식별자) 이므로
  //    닉네임 변경과 무관하게 한 사용자의 누적 활동이 정확히 합산된다.
  //    (시드/봇으로 작성된 firebase_uid=NULL 글은 자연스럽게 제외)
  const [postsR, commentsR, jobsR, tradesR, nickHistR] = await Promise.all([
    sb.from("posts").select("firebase_uid").in("firebase_uid", uids),
    sb.from("comments").select("firebase_uid").in("firebase_uid", uids),
    sb.from("job_posts").select("firebase_uid").in("firebase_uid", uids),
    sb.from("trade_posts").select("firebase_uid").in("firebase_uid", uids).neq("status", "deleted"),
    sb.from("nickname_history").select("firebase_uid, reason").in("firebase_uid", uids),
  ]);

  const tally = (rs: { firebase_uid: string }[] | null | undefined): Record<string, number> => {
    const m: Record<string, number> = {};
    for (const r of rs || []) m[r.firebase_uid] = (m[r.firebase_uid] || 0) + 1;
    return m;
  };
  const postsCnt = tally(postsR.data);
  const commentsCnt = tally(commentsR.data);
  const jobsCnt = tally(jobsR.data);
  const tradesCnt = tally(tradesR.data);

  // 닉네임 변경 횟수: reason='user_change' 만 카운트 (first_setup 제외).
  // history 자체가 없는 사용자는 0.
  const nickChangeCnt: Record<string, number> = {};
  for (const r of (nickHistR.data || []) as { firebase_uid: string; reason: string | null }[]) {
    if (r.reason === "user_change") {
      nickChangeCnt[r.firebase_uid] = (nickChangeCnt[r.firebase_uid] || 0) + 1;
    }
  }

  // 3) Firebase Auth 이메일 bulk lookup (최대 100명/요청)
  const emailMap: Record<string, string | null> = {};
  try {
    const r = await getAuth().getUsers(uids.map((uid) => ({ uid })));
    for (const u of r.users) emailMap[u.uid] = u.email || null;
  } catch {
    /* ignore — 이메일 누락 허용 */
  }

  const users = list.map((row) => ({
    nickname: row.name,
    firebase_uid: row.firebase_uid,
    email: emailMap[row.firebase_uid] ?? null,
    created_at: row.created_at,
    nick_changed_at: row.changed_at,
    nick_change_count: nickChangeCnt[row.firebase_uid] || 0,
    active_region_name: row.active_region_name,
    posts: postsCnt[row.firebase_uid] || 0,
    comments: commentsCnt[row.firebase_uid] || 0,
    jobs: jobsCnt[row.firebase_uid] || 0,
    trades: tradesCnt[row.firebase_uid] || 0,
  }));

  const total = count ?? 0;
  const totalPages = Math.ceil(total / limit);
  return NextResponse.json({ users, total, page, limit, totalPages });
}
