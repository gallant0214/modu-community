import { supabase } from "@/app/lib/supabase";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { sanitize, checkRateLimit, getClientIp, validateLength } from "@/app/lib/security";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { sendPushToUser } from "@/app/lib/notifications";
import { waitUntil } from "@vercel/functions";

export const dynamic = "force-dynamic";

function maskIp(ip: string): string {
  if (!ip || ip === "unknown") return "";
  const v4Match = ip.match(/(\d+\.\d+\.\d+\.\d+)/);
  if (v4Match) {
    const parts = v4Match[1].split(".");
    return `${parts[0]}.${parts[1]}`;
  }
  return "";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const { postId } = await params;
  const user = await verifyAuth(request);
  const pid = Number(postId);

  const { data: rows, error } = await supabase
    .from("comments")
    .select("id, post_id, parent_id, author, content, likes, ip_address, firebase_uid, created_at, updated_at, hidden")
    .eq("post_id", pid)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // reply_count는 별도 쿼리로 (parent_id 기준 그룹)
  const { data: replyParents } = await supabase
    .from("comments")
    .select("parent_id")
    .eq("post_id", pid)
    .not("parent_id", "is", null)
    .limit(100000);
  const replyCounts = new Map<number, number>();
  for (const r of replyParents || []) {
    if (r.parent_id != null) {
      replyCounts.set(r.parent_id, (replyCounts.get(r.parent_id) || 0) + 1);
    }
  }

  // 현재 사용자가 좋아요한 댓글 ID 목록
  let likedCommentIds: Set<number> = new Set();
  if (user) {
    const { data: liked } = await supabase
      .from("comment_likes")
      .select("comment_id")
      .eq("firebase_uid", user.uid)
      .limit(100000);
    likedCommentIds = new Set((liked || []).map((r) => r.comment_id));
  }

  const result = rows.map((c) => ({
    ...c,
    likes: c.likes ?? 0,
    hidden: c.hidden ?? false,
    reply_count: replyCounts.get(c.id) || 0,
    ip_display: maskIp(c.ip_address || ""),
    ip_address: undefined,
    firebase_uid: undefined,
    is_liked: likedCommentIds.has(c.id),
    is_mine: !!(user && c.firebase_uid && c.firebase_uid === user.uid),
  }));
  return NextResponse.json(result);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인을 해주세요" }, { status: 401 });

  const ip = getClientIp(request);
  const rateLimitResponse = checkRateLimit(ip, "write");
  if (rateLimitResponse) return rateLimitResponse;

  const { postId } = await params;
  const pid = Number(postId);
  const body = await request.json();
  const { author, password, content, parent_id } = body;

  if (!author?.trim() || !content?.trim()) {
    return NextResponse.json({ error: "모든 항목을 입력해주세요" }, { status: 400 });
  }

  const h = await headers();
  const ipAddr = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";

  const { data: inserted, error: insertErr } = await supabase
    .from("comments")
    .insert({
      post_id: pid,
      parent_id: parent_id ?? null,
      author: sanitize(validateLength(author.trim(), 50)),
      password: password.trim(),
      content: sanitize(validateLength(content.trim(), 5000)),
      ip_address: ipAddr,
      firebase_uid: user.uid,
    })
    .select("id")
    .single();
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  const newCommentId = inserted.id;

  // posts.comments_count 재계산
  const { count } = await supabase
    .from("comments")
    .select("*", { count: "exact", head: true })
    .eq("post_id", pid);
  await supabase
    .from("posts")
    .update({ comments_count: count ?? 0 })
    .eq("id", pid);

  // 알림 발송 (비동기)
  try {
    if (parent_id) {
      const { data: parentComment } = await supabase
        .from("comments")
        .select("firebase_uid, content")
        .eq("id", parent_id)
        .maybeSingle();
      if (parentComment?.firebase_uid && parentComment.firebase_uid !== user.uid) {
        waitUntil(
          sendPushToUser(
            parentComment.firebase_uid,
            "reply",
            "내 댓글에 답글이 달렸어요",
            content.trim().substring(0, 100),
            { postId: String(pid), commentId: String(newCommentId) },
          ).catch(() => {}),
        );
      }
    } else {
      const { data: post } = await supabase
        .from("posts")
        .select("firebase_uid, title")
        .eq("id", pid)
        .maybeSingle();
      if (post?.firebase_uid && post.firebase_uid !== user.uid) {
        waitUntil(
          sendPushToUser(
            post.firebase_uid,
            "comment",
            `"${(post.title || "").substring(0, 30)}" 글에 댓글이 달렸어요`,
            content.trim().substring(0, 100),
            { postId: String(pid), commentId: String(newCommentId) },
          ).catch(() => {}),
        );
      }
    }
  } catch {}

  return NextResponse.json({ success: true });
}
