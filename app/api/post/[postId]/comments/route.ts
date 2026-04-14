import { sql } from "@/app/lib/db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { sanitize, checkRateLimit, getClientIp, validateLength } from "@/app/lib/security";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { sendPushToUser } from "@/app/lib/notifications";

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

  const rows = await sql`
    SELECT c.id, c.post_id, c.parent_id, c.author, c.content, COALESCE(c.likes, 0) AS likes,
      (SELECT COUNT(*) FROM comments r WHERE r.parent_id = c.id) AS reply_count,
      c.ip_address, c.firebase_uid, c.created_at, c.updated_at
    FROM comments c WHERE c.post_id = ${Number(postId)} ORDER BY c.created_at ASC`;

  // 현재 사용자가 좋아요한 댓글 ID 목록
  let likedCommentIds: Set<number> = new Set();
  if (user) {
    const liked = await sql`
      SELECT comment_id FROM comment_likes WHERE firebase_uid = ${user.uid}
    `;
    likedCommentIds = new Set(liked.map((r: { comment_id: number }) => r.comment_id));
  }

  const result = rows.map((c: Record<string, unknown>) => ({
    ...c,
    ip_display: maskIp(String(c.ip_address || "")),
    ip_address: undefined,
    firebase_uid: undefined,
    password: undefined,
    is_liked: likedCommentIds.has(c.id as number),
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

  const uid = user.uid;

  await sql`INSERT INTO comments (post_id, parent_id, author, password, content, ip_address, firebase_uid)
    VALUES (${pid}, ${parent_id ?? null}, ${sanitize(validateLength(author.trim(), 50))}, ${password.trim()}, ${sanitize(validateLength(content.trim(), 5000))}, ${ipAddr}, ${uid})`;
  await sql`UPDATE posts SET comments_count = (SELECT COUNT(*) FROM comments WHERE post_id = ${pid}) WHERE id = ${pid}`;

  // 알림 발송 (비동기, 실패해도 댓글 작성에 영향 없음)
  try {
    if (parent_id) {
      // 대댓글: 원 댓글 작성자에게 알림
      const parentComment = await sql`SELECT firebase_uid, content FROM comments WHERE id = ${parent_id}`;
      if (parentComment.length > 0 && parentComment[0].firebase_uid && parentComment[0].firebase_uid !== uid) {
        sendPushToUser(
          parentComment[0].firebase_uid,
          "reply",
          "내 댓글에 답글이 달렸어요",
          content.trim().substring(0, 100),
          { postId: String(pid) }
        ).catch(() => {});
      }
    } else {
      // 일반 댓글: 게시글 작성자에게 알림
      const post = await sql`SELECT firebase_uid, title FROM posts WHERE id = ${pid}`;
      if (post.length > 0 && post[0].firebase_uid && post[0].firebase_uid !== uid) {
        sendPushToUser(
          post[0].firebase_uid,
          "comment",
          `"${(post[0].title || "").substring(0, 30)}" 글에 댓글이 달렸어요`,
          content.trim().substring(0, 100),
          { postId: String(pid) }
        ).catch(() => {});
      }
    }
  } catch {}

  return NextResponse.json({ success: true });
}
