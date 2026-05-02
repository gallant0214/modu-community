import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAdminPassword } from "@/app/lib/admin-auth";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

export const dynamic = "force-dynamic";

function getFirebaseAdmin() {
  if (getApps().length === 0) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccount) {
      return initializeApp({ credential: cert(JSON.parse(serviceAccount)) });
    }
    return initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || "moducm-f2edf" });
  }
  return getApps()[0];
}

// POST /api/admin/reports-list — 신고 목록 + 신고자/작성자 닉네임·이메일 보강
// body: { password }
// 기존 admin_reports_with_targets RPC 결과에 다음을 추가:
//   - reporter_uid, reporter_nickname, reporter_email
//   - post_author_email / comment_author_email / job_author_email / message_sender_email
//   - target_exists (실제 게시글 존재 여부 — '삭제된 게시글' 잘못 표시 방지)
export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({}));
  if (!(await verifyAdminPassword(password))) {
    return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
  }

  // 1) reports 직접 조회 — RPC 가 reporter_uid 를 반환 안 해서 직접 쿼리
  const { data: reportsRaw, error: repErr } = await (supabase as any)
    .from("reports")
    .select("id, target_type, target_id, post_id, category_id, reason, custom_reason, resolved, resolved_at, deleted_at, target_hidden, created_at, reporter_uid")
    .order("created_at", { ascending: false })
    .limit(500);
  if (repErr) {
    return NextResponse.json({ error: repErr.message }, { status: 500 });
  }
  const reports: any[] = reportsRaw || [];

  // 2) 타겟별 id 모으기
  const postIds = new Set<number>();
  const commentIds = new Set<number>();
  const jobIds = new Set<number>();
  const messageIds = new Set<number>();
  const categoryIds = new Set<number>();
  for (const r of reports) {
    if (r.target_type === "post") postIds.add(r.target_id);
    else if (r.target_type === "comment") commentIds.add(r.target_id);
    else if (r.target_type === "job") jobIds.add(r.target_id);
    else if (r.target_type === "message") messageIds.add(r.target_id);
    if (r.post_id && r.post_id > 0) postIds.add(r.post_id);
    if (r.category_id && r.category_id > 0) categoryIds.add(r.category_id);
  }

  // 3) 타겟 일괄 조회
  const fetchIn = async (table: string, ids: Set<number>, cols: string) => {
    if (ids.size === 0) return [] as any[];
    const { data } = await (supabase as any).from(table).select(cols).in("id", Array.from(ids));
    return data || [];
  };
  const [postRows, commentRows, jobRows, messageRows, categoryRows] = await Promise.all([
    fetchIn("posts", postIds, "id, title, author, password, category_id"),
    fetchIn("comments", commentIds, "id, content, author, password, post_id"),
    fetchIn("job_posts", jobIds, "id, title, author_name, password"),
    fetchIn("messages", messageIds, "id, content, sender_uid, sender_nickname, receiver_uid, receiver_nickname"),
    fetchIn("categories", categoryIds, "id, name"),
  ]);
  const postMap = new Map<number, any>(postRows.map((p: any) => [p.id, p]));
  const commentMap = new Map<number, any>(commentRows.map((c: any) => [c.id, c]));
  const jobMap = new Map<number, any>(jobRows.map((j: any) => [j.id, j]));
  const messageMap = new Map<number, any>(messageRows.map((m: any) => [m.id, m]));
  const categoryMap = new Map<number, string>(categoryRows.map((c: any) => [c.id, c.name]));

  // 4) UID 모으기 (신고자 + 각 타겟 작성자)
  const uidSet = new Set<string>();
  for (const r of reports) {
    if (r.reporter_uid) uidSet.add(r.reporter_uid);
    if (r.target_type === "post") {
      const p = postMap.get(r.target_id);
      if (p?.password) uidSet.add(p.password);
    } else if (r.target_type === "comment") {
      const c = commentMap.get(r.target_id);
      if (c?.password) uidSet.add(c.password);
    } else if (r.target_type === "job") {
      const j = jobMap.get(r.target_id);
      if (j?.password) uidSet.add(j.password);
    } else if (r.target_type === "message") {
      const m = messageMap.get(r.target_id);
      if (m?.sender_uid) uidSet.add(m.sender_uid);
    }
  }
  const uids = Array.from(uidSet);

  // 5) nicknames 일괄 조회 (firebase_uid → name)
  const nicknameMap = new Map<string, string>();
  if (uids.length > 0) {
    const { data: nickRows } = await (supabase as any)
      .from("nicknames")
      .select("firebase_uid, name")
      .in("firebase_uid", uids);
    for (const n of nickRows || []) {
      if (n.firebase_uid && n.name) nicknameMap.set(n.firebase_uid, n.name);
    }
  }

  // 6) Firebase Admin 으로 이메일 일괄 조회 (배치 100명 단위)
  const emailMap = new Map<string, string>();
  if (uids.length > 0) {
    try {
      const admin = getFirebaseAdmin();
      const auth = getAuth(admin);
      for (let i = 0; i < uids.length; i += 100) {
        const batch = uids.slice(i, i + 100).map((uid) => ({ uid }));
        const result = await auth.getUsers(batch);
        for (const u of result.users) {
          if (u.uid && u.email) emailMap.set(u.uid, u.email);
        }
      }
    } catch (e) {
      // Firebase Admin 사용 불가능 시 이메일 보강 스킵 — 닉네임만 표시
      console.error("[admin/reports-list] firebase-admin getUsers failed:", e);
    }
  }

  // 7) 각 report 보강
  const enriched = reports.map((r: any) => {
    const reporter_nickname = r.reporter_uid ? nicknameMap.get(r.reporter_uid) || null : null;
    const reporter_email = r.reporter_uid ? emailMap.get(r.reporter_uid) || null : null;

    let target_exists = false;
    let post_title: string | null = null;
    let post_author: string | null = null;
    let post_author_email: string | null = null;
    let comment_content: string | null = null;
    let comment_author: string | null = null;
    let comment_author_email: string | null = null;
    let job_title: string | null = null;
    let job_author: string | null = null;
    let job_author_email: string | null = null;
    let message_content: string | null = null;
    let message_sender: string | null = null;
    let message_sender_email: string | null = null;
    let message_receiver: string | null = null;

    if (r.target_type === "post") {
      const p = postMap.get(r.target_id);
      if (p) {
        target_exists = true;
        post_title = p.title;
        const authorUid = p.password;
        post_author = (authorUid && nicknameMap.get(authorUid)) || p.author || null;
        post_author_email = authorUid ? emailMap.get(authorUid) || null : null;
      }
    } else if (r.target_type === "comment") {
      const c = commentMap.get(r.target_id);
      if (c) {
        target_exists = true;
        comment_content = c.content;
        const authorUid = c.password;
        comment_author = (authorUid && nicknameMap.get(authorUid)) || c.author || null;
        comment_author_email = authorUid ? emailMap.get(authorUid) || null : null;
      }
      // comment 의 게시글 정보는 r.post_id 또는 commentRow.post_id 로 별도 조회
      const cRow = commentMap.get(r.target_id);
      const pId = cRow?.post_id || r.post_id;
      if (pId) {
        const p = postMap.get(pId);
        if (p) post_title = p.title;
      }
    } else if (r.target_type === "job") {
      const j = jobMap.get(r.target_id);
      if (j) {
        target_exists = true;
        job_title = j.title;
        const authorUid = j.password;
        job_author = (authorUid && nicknameMap.get(authorUid)) || j.author_name || null;
        job_author_email = authorUid ? emailMap.get(authorUid) || null : null;
      }
    } else if (r.target_type === "message") {
      const m = messageMap.get(r.target_id);
      if (m) {
        target_exists = true;
        message_content = m.content;
        const senderUid = m.sender_uid;
        message_sender = (senderUid && nicknameMap.get(senderUid)) || m.sender_nickname || null;
        message_sender_email = senderUid ? emailMap.get(senderUid) || null : null;
        message_receiver = (m.receiver_uid && nicknameMap.get(m.receiver_uid)) || m.receiver_nickname || null;
      }
    }

    return {
      id: r.id,
      target_type: r.target_type,
      target_id: r.target_id,
      post_id: r.post_id,
      category_id: r.category_id,
      category_name: r.category_id ? categoryMap.get(r.category_id) || null : null,
      reason: r.reason,
      custom_reason: r.custom_reason,
      resolved: r.resolved,
      resolved_at: r.resolved_at,
      deleted_at: r.deleted_at,
      target_hidden: r.target_hidden,
      created_at: r.created_at,
      reporter_uid: r.reporter_uid,
      reporter_nickname,
      reporter_email,
      target_exists,
      post_title,
      post_author,
      post_author_email,
      comment_content,
      comment_author,
      comment_author_email,
      job_title,
      job_author,
      job_author_email,
      message_content,
      message_sender,
      message_sender_email,
      message_receiver,
    };
  });

  return NextResponse.json({ reports: enriched });
}
