export const dynamic = "force-dynamic";

import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAdminPassword } from "@/app/lib/admin-auth";
import { getAuth } from "firebase-admin/auth";
import "@/app/lib/firebase-admin";

// POST /api/admin/users/lookup
// body: { password, nickname }
// 닉네임으로 사용자 식별 → 가입 정보 + 닉네임 이력 + 활동 카운트 + 최근 활동 일부 반환.
//   현재 닉네임 일치 우선, 없으면 nickname_history.old_nickname / new_nickname 에서 매칭.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { password, nickname } = body as { password?: string; nickname?: string };
  if (!(await verifyAdminPassword(password || ""))) {
    return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
  }
  const q = (nickname || "").trim();
  if (!q) {
    return NextResponse.json({ error: "닉네임을 입력하세요" }, { status: 400 });
  }

  const sb = supabase as any;

  // 1) 현재 닉네임 우선 매칭
  let { data: nick } = await sb
    .from("nicknames")
    .select("name, firebase_uid, created_at, changed_at, active_region_code, active_region_name, terms_agreed_at, privacy_agreed_at, terms_version")
    .eq("name", q)
    .maybeSingle();

  // 2) 못 찾으면 history 의 new/old nickname 에서 매칭 → 거기서 firebase_uid 찾고 다시 nicknames 조회
  let matchedFromHistory = false;
  if (!nick) {
    const { data: hist } = await sb
      .from("nickname_history")
      .select("firebase_uid")
      .or(`new_nickname.eq.${q},old_nickname.eq.${q}`)
      .order("changed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (hist?.firebase_uid) {
      matchedFromHistory = true;
      const r = await sb
        .from("nicknames")
        .select("name, firebase_uid, created_at, changed_at, active_region_code, active_region_name, terms_agreed_at, privacy_agreed_at, terms_version")
        .eq("firebase_uid", hist.firebase_uid)
        .maybeSingle();
      nick = r.data;
    }
  }

  if (!nick) {
    return NextResponse.json({ error: "해당 닉네임을 찾을 수 없습니다" }, { status: 404 });
  }

  const uid = nick.firebase_uid;

  // 3) Firebase Auth 사용자 정보 (이메일/제공자/생성일/마지막 로그인)
  let firebaseUser: {
    email: string | null;
    emailVerified: boolean;
    providers: string[];
    createdAt: string | null;
    lastSignInAt: string | null;
    disabled: boolean;
  } | null = null;
  try {
    const u = await getAuth().getUser(uid);
    firebaseUser = {
      email: u.email || null,
      emailVerified: !!u.emailVerified,
      providers: (u.providerData || []).map((p) => p.providerId),
      createdAt: u.metadata?.creationTime || null,
      lastSignInAt: u.metadata?.lastSignInTime || null,
      disabled: !!u.disabled,
    };
  } catch {
    firebaseUser = null;
  }

  // 4) 닉네임 이력 (최신순 100건)
  const { data: history } = await sb
    .from("nickname_history")
    .select("id, old_nickname, new_nickname, changed_at, ip_address, user_agent, reason, email")
    .eq("firebase_uid", uid)
    .order("changed_at", { ascending: false })
    .limit(100);

  // 5) 활동 카운트 — 병렬
  const [
    postsRes,
    commentsRes,
    jobsRes,
    tradesRes,
    sentMsgRes,
    recvMsgRes,
    bookmarksRes,
    jobBmRes,
    tradeBmRes,
    blocksRes,
  ] = await Promise.all([
    sb.from("posts").select("id, title, created_at").eq("firebase_uid", uid).order("created_at", { ascending: false }).limit(30),
    sb.from("comments").select("id, post_id, content, created_at").eq("firebase_uid", uid).order("created_at", { ascending: false }).limit(30),
    sb.from("job_posts").select("id, title, created_at, is_closed").eq("firebase_uid", uid).order("created_at", { ascending: false }).limit(30),
    sb.from("trade_posts").select("id, title, category, status, created_at").eq("firebase_uid", uid).order("created_at", { ascending: false }).limit(30),
    sb.from("messages").select("id", { count: "exact", head: true }).eq("sender_uid", uid),
    sb.from("messages").select("id", { count: "exact", head: true }).eq("receiver_uid", uid),
    sb.from("post_bookmarks").select("id", { count: "exact", head: true }).eq("firebase_uid", uid),
    sb.from("job_post_bookmarks").select("id", { count: "exact", head: true }).eq("firebase_uid", uid),
    sb.from("trade_post_bookmarks").select("id", { count: "exact", head: true }).eq("firebase_uid", uid),
    sb.from("user_blocks").select("id", { count: "exact", head: true }).eq("blocker_uid", uid),
  ]);

  return NextResponse.json({
    matchedFromHistory,
    nickname: nick.name,
    firebase_uid: uid,
    firebaseUser,
    nicknames_record: {
      created_at: nick.created_at,
      changed_at: nick.changed_at,
      active_region_code: nick.active_region_code,
      active_region_name: nick.active_region_name,
      terms_agreed_at: nick.terms_agreed_at,
      privacy_agreed_at: nick.privacy_agreed_at,
      terms_version: nick.terms_version,
    },
    nickname_history: history || [],
    counts: {
      posts: postsRes.data?.length || 0,
      comments: commentsRes.data?.length || 0,
      jobs: jobsRes.data?.length || 0,
      trades: tradesRes.data?.length || 0,
      messages_sent: sentMsgRes.count ?? 0,
      messages_received: recvMsgRes.count ?? 0,
      post_bookmarks: bookmarksRes.count ?? 0,
      job_bookmarks: jobBmRes.count ?? 0,
      trade_bookmarks: tradeBmRes.count ?? 0,
      blocks_made: blocksRes.count ?? 0,
    },
    recent: {
      posts: postsRes.data || [],
      comments: commentsRes.data || [],
      jobs: jobsRes.data || [],
      trades: tradesRes.data || [],
    },
  });
}
