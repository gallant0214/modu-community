import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";
import { sanitize, checkRateLimit, getClientIp, validateLength } from "@/app/lib/security";
import { verifyAuth, isAdminUid } from "@/app/lib/firebase-admin";

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
  const id = Number(postId);
  const rows = await sql`SELECT p.id, p.category_id, p.title, p.content, p.author, p.region, p.tags, p.likes, p.comments_count, p.is_notice, p.views, p.created_at, p.updated_at, p.ip_address, c.name as category_name FROM posts p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ${id}`;
  if (rows.length === 0) {
    return NextResponse.json(null, { status: 404 });
  }
  const post = rows[0];

  // 현재 사용자의 좋아요/북마크 여부 확인
  let isLiked = false;
  let isBookmarked = false;
  const user = await verifyAuth(request);
  if (user) {
    try {
      await sql`ALTER TABLE post_likes ADD COLUMN IF NOT EXISTS firebase_uid TEXT`;
      const liked = await sql`
        SELECT id FROM post_likes WHERE post_id = ${id} AND firebase_uid = ${user.uid} LIMIT 1
      `;
      isLiked = liked.length > 0;

      const bookmarked = await sql`
        SELECT id FROM post_bookmarks WHERE post_id = ${id} AND firebase_uid = ${user.uid} LIMIT 1
      `;
      isBookmarked = bookmarked.length > 0;
    } catch { /* ignore */ }
  }

  return NextResponse.json({
    ...post,
    ip_display: maskIp(post.ip_address || ""),
    ip_address: undefined,
    password: undefined,
    is_liked: isLiked,
    is_bookmarked: isBookmarked,
    is_mine: user ? post.firebase_uid === user.uid : false,
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인을 해주세요" }, { status: 401 });

  const ip = getClientIp(request);
  const rateLimitResponse = checkRateLimit(ip, "write");
  if (rateLimitResponse) return rateLimitResponse;

  const { postId } = await params;
  const body = await request.json();
  const { title, content, region, tags } = body;

  if (!title?.trim() || !content?.trim()) {
    return NextResponse.json({ error: "제목과 내용을 입력해주세요" }, { status: 400 });
  }

  await sql`
    UPDATE posts
    SET title = ${sanitize(validateLength(title.trim(), 200))}, content = ${sanitize(validateLength(content.trim(), 50000))}, region = ${sanitize(validateLength(region || "", 50))}, tags = ${sanitize(validateLength(tags || "", 200))}, updated_at = NOW()
    WHERE id = ${Number(postId)}
  `;
  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인을 해주세요" }, { status: 401 });

  const ip = getClientIp(request);
  const rateLimitResponse = checkRateLimit(ip, "write");
  if (rateLimitResponse) return rateLimitResponse;

  const { postId } = await params;
  const body = await request.json();
  const { password } = body;
  const id = Number(postId);

  const rows = await sql`SELECT password FROM posts WHERE id = ${id}`;
  if (rows.length === 0) {
    return NextResponse.json({ error: "게시글을 찾을 수 없습니다" }, { status: 404 });
  }

  let isAdminUser = isAdminUid(user.uid);
  if (!isAdminUser && user.email) {
    try {
      const adminRows = await sql`SELECT id FROM admin_emails WHERE email = ${user.email.toLowerCase()} LIMIT 1`;
      isAdminUser = adminRows.length > 0;
    } catch { /* ignore */ }
  }
  const isAdminPw = password === process.env.ADMIN_PASSWORD;
  if (!isAdminUser && !isAdminPw && rows[0].password !== password) {
    return NextResponse.json({ error: "비밀번호가 일치하지 않습니다" }, { status: 403 });
  }

  await sql`DELETE FROM posts WHERE id = ${id}`;
  return NextResponse.json({ success: true });
}
