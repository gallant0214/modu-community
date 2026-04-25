import { sql } from "@/app/lib/db";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { sanitize, checkRateLimit, getClientIp, validateLength } from "@/app/lib/security";
import { verifyAuth, isAdminUid } from "@/app/lib/firebase-admin";
import { invalidateCache } from "@/app/lib/cache";

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
  const rows = await sql`SELECT p.id, p.category_id, p.title, p.content, p.author, p.region, p.tags, p.likes, p.comments_count, p.is_notice, p.views, p.created_at, p.updated_at, p.ip_address, p.firebase_uid, p.images, c.name as category_name FROM posts p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ${id}`;
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

  const isMine = !!(user && post.firebase_uid && post.firebase_uid === user.uid);
  return NextResponse.json({
    ...post,
    firebase_uid: undefined,
    ip_display: maskIp(post.ip_address || ""),
    ip_address: undefined,
    password: undefined,
    is_liked: isLiked,
    is_bookmarked: isBookmarked,
    is_mine: isMine,
  });
}

// 관리자 여부 확인 (uid 또는 admin_emails 테이블)
async function checkIsAdmin(uid: string, email: string | null | undefined) {
  if (isAdminUid(uid)) return true;
  if (email) {
    try {
      const adminRows = await sql`SELECT id FROM admin_emails WHERE email = ${email.toLowerCase()} LIMIT 1`;
      if (adminRows.length > 0) return true;
    } catch { /* ignore */ }
  }
  return false;
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
  const { title, content, region, tags, images } = body;

  if (!title?.trim() || !content?.trim()) {
    return NextResponse.json({ error: "제목과 내용을 입력해주세요" }, { status: 400 });
  }

  // 소유권 확인: 작성자(firebase_uid) 또는 관리자만 수정 가능
  const ownerRows = await sql`SELECT firebase_uid, category_id FROM posts WHERE id = ${Number(postId)}`;
  if (ownerRows.length === 0) {
    return NextResponse.json({ error: "게시글을 찾을 수 없습니다" }, { status: 404 });
  }
  const isOwner = ownerRows[0].firebase_uid && ownerRows[0].firebase_uid === user.uid;
  const isAdminUser = await checkIsAdmin(user.uid, user.email);
  if (!isOwner && !isAdminUser) {
    return NextResponse.json({ error: "본인 또는 관리자만 수정할 수 있습니다" }, { status: 403 });
  }

  await sql`
    UPDATE posts
    SET title = ${sanitize(validateLength(title.trim(), 200))}, content = ${validateLength(content.trim(), 50000)}, region = ${sanitize(validateLength(region || "", 50))}, tags = ${sanitize(validateLength(tags || "", 200))}, images = ${(images || "").trim()}, updated_at = NOW()
    WHERE id = ${Number(postId)}
  `;

  revalidatePath("/community");
  revalidatePath(`/category/${ownerRows[0].category_id}`);
  revalidatePath(`/category/${ownerRows[0].category_id}/post/${postId}`);

  // 게시글 목록/상세 Upstash 캐시 즉시 무효화
  await invalidateCache("posts:*").catch(() => {});
  await invalidateCache(`post:${postId}:*`).catch(() => {});

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
  const body = await request.json().catch(() => ({}));
  const { password } = body;
  const id = Number(postId);

  const rows = await sql`SELECT password, firebase_uid, category_id FROM posts WHERE id = ${id}`;
  if (rows.length === 0) {
    return NextResponse.json({ error: "게시글을 찾을 수 없습니다" }, { status: 404 });
  }

  const isOwner = rows[0].firebase_uid && rows[0].firebase_uid === user.uid;
  const isAdminUser = await checkIsAdmin(user.uid, user.email);
  const isAdminPw = password && password === process.env.ADMIN_PASSWORD;
  const isLegacyPw = password && rows[0].password && rows[0].password === password;
  if (!isOwner && !isAdminUser && !isAdminPw && !isLegacyPw) {
    return NextResponse.json({ error: "본인 또는 관리자만 삭제할 수 있습니다" }, { status: 403 });
  }

  await sql`DELETE FROM posts WHERE id = ${id}`;

  revalidatePath("/community");
  revalidatePath(`/category/${rows[0].category_id}`);
  revalidatePath(`/category/${rows[0].category_id}/post/${id}`);

  // 게시글 목록/상세 Upstash 캐시 즉시 무효화
  await invalidateCache("posts:*").catch(() => {});
  await invalidateCache(`post:${id}:*`).catch(() => {});

  return NextResponse.json({ success: true });
}
