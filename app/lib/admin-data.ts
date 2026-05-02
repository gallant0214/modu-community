// 관리자 페이지용 데이터 보강 헬퍼 — server action 에서 self-fetch 우회
// (Vercel 에서 server action → 자기 자신 API fetch 가 인증/네트워크 문제로 실패하는 패턴 회피)

import { supabase } from "./supabase";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

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

async function fetchEmailsByUids(uids: string[]): Promise<Map<string, string>> {
  const emailMap = new Map<string, string>();
  if (uids.length === 0) return emailMap;
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
    console.error("[admin-data] firebase getUsers failed:", e);
  }
  return emailMap;
}

export async function loadEnrichedReports(): Promise<any[]> {
  const { data: reportsRaw, error: repErr } = await (supabase as any)
    .from("reports")
    .select("id, target_type, target_id, post_id, category_id, reason, custom_reason, resolved, resolved_at, deleted_at, target_hidden, created_at, reporter_uid")
    .order("created_at", { ascending: false })
    .limit(500);
  if (repErr) throw new Error(repErr.message);
  const reports: any[] = reportsRaw || [];

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

  const fetchIn = async (table: string, ids: Set<number>, cols: string) => {
    if (ids.size === 0) return [] as any[];
    const { data } = await (supabase as any).from(table).select(cols).in("id", Array.from(ids));
    return data || [];
  };

  const [postRows, commentRows, jobRows, messageRows, categoryRows] = await Promise.all([
    fetchIn("posts", postIds, "id, title, author, firebase_uid, category_id"),
    fetchIn("comments", commentIds, "id, content, author, firebase_uid, post_id"),
    fetchIn("job_posts", jobIds, "id, title, author_name, firebase_uid"),
    fetchIn("messages", messageIds, "id, content, sender_uid, sender_nickname, receiver_uid, receiver_nickname"),
    fetchIn("categories", categoryIds, "id, name"),
  ]);

  const postMap = new Map<number, any>(postRows.map((p: any) => [p.id, p]));
  const commentMap = new Map<number, any>(commentRows.map((c: any) => [c.id, c]));
  const jobMap = new Map<number, any>(jobRows.map((j: any) => [j.id, j]));
  const messageMap = new Map<number, any>(messageRows.map((m: any) => [m.id, m]));
  const categoryMap = new Map<number, string>(categoryRows.map((c: any) => [c.id, c.name]));

  const uidSet = new Set<string>();
  for (const r of reports) {
    if (r.reporter_uid) uidSet.add(r.reporter_uid);
    if (r.target_type === "post") {
      const p = postMap.get(r.target_id);
      if (p?.firebase_uid) uidSet.add(p.firebase_uid);
    } else if (r.target_type === "comment") {
      const c = commentMap.get(r.target_id);
      if (c?.firebase_uid) uidSet.add(c.firebase_uid);
    } else if (r.target_type === "job") {
      const j = jobMap.get(r.target_id);
      if (j?.firebase_uid) uidSet.add(j.firebase_uid);
    } else if (r.target_type === "message") {
      const m = messageMap.get(r.target_id);
      if (m?.sender_uid) uidSet.add(m.sender_uid);
      if (m?.receiver_uid) uidSet.add(m.receiver_uid);
    }
  }
  const uids = Array.from(uidSet);

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

  const emailMap = await fetchEmailsByUids(uids);

  return reports.map((r: any) => {
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
        const authorUid = p.firebase_uid;
        post_author = (authorUid && nicknameMap.get(authorUid)) || p.author || null;
        post_author_email = authorUid ? emailMap.get(authorUid) || null : null;
      }
    } else if (r.target_type === "comment") {
      const c = commentMap.get(r.target_id);
      if (c) {
        target_exists = true;
        comment_content = c.content;
        const authorUid = c.firebase_uid;
        comment_author = (authorUid && nicknameMap.get(authorUid)) || c.author || null;
        comment_author_email = authorUid ? emailMap.get(authorUid) || null : null;
      }
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
        const authorUid = j.firebase_uid;
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
}

export async function loadEnrichedInquiries(): Promise<any[]> {
  const { data, error } = await (supabase as any)
    .from("inquiries")
    .select("id, author, email, title, content, reply, replied_at, hidden, created_at, firebase_uid")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const inquiries: any[] = data || [];

  const uids = Array.from(new Set(inquiries.map((i) => i.firebase_uid).filter(Boolean))) as string[];

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

  const emailMap = await fetchEmailsByUids(uids);

  return inquiries.map((i: any) => ({
    ...i,
    current_nickname: i.firebase_uid ? nicknameMap.get(i.firebase_uid) || null : null,
    current_email: i.firebase_uid ? emailMap.get(i.firebase_uid) || null : null,
  }));
}
