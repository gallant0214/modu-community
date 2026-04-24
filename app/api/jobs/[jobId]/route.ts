import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";
import { verifyAuth, isAdminUid } from "@/app/lib/firebase-admin";
import { sanitize, checkRateLimit, getClientIp, validateLength } from "@/app/lib/security";
import { invalidateCache } from "@/app/lib/cache";

export const dynamic = "force-dynamic";

// GET /api/jobs/[jobId] — 구인글 상세 (공개)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const rows = await sql`SELECT * FROM job_posts WHERE id = ${Number(jobId)}`;

  if (rows.length === 0) {
    return NextResponse.json({ error: "게시글을 찾을 수 없습니다" }, { status: 404 });
  }

  // 북마크 수 조회
  let bookmarkCount = 0;
  try {
    const bm = await sql`
      SELECT COUNT(*)::int AS count FROM job_post_bookmarks WHERE job_post_id = ${Number(jobId)}
    `;
    bookmarkCount = bm[0]?.count || 0;
  } catch { /* 테이블 미생성 시 무시 */ }

  // 좋아요/북마크 여부
  let isLiked = false;
  let isBookmarked = false;
  const user = await verifyAuth(request);
  if (user) {
    try {
      const liked = await sql`SELECT id FROM job_post_likes WHERE job_post_id = ${Number(jobId)} AND firebase_uid = ${user.uid} LIMIT 1`;
      isLiked = liked.length > 0;
    } catch {}
    try {
      const bked = await sql`SELECT id FROM job_post_bookmarks WHERE job_post_id = ${Number(jobId)} AND firebase_uid = ${user.uid} LIMIT 1`;
      isBookmarked = bked.length > 0;
    } catch {}
  }

  const job = rows[0];
  return NextResponse.json({
    ...job,
    bookmark_count: bookmarkCount,
    is_liked: isLiked,
    is_bookmarked: isBookmarked,
    is_mine: user ? job.firebase_uid === user.uid : false,
  });
}

// PUT /api/jobs/[jobId] — 구인글 수정 (인증 + 소유자 확인)
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const user = await verifyAuth(request);
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const ip = getClientIp(request);
  const rateLimitResponse = checkRateLimit(ip, "write");
  if (rateLimitResponse) return rateLimitResponse;

  const { jobId } = await params;
  const body = await request.json();

  // 소유자 또는 관리자 확인
  const existing = await sql`SELECT firebase_uid FROM job_posts WHERE id = ${Number(jobId)}`;
  if (existing.length === 0) {
    return NextResponse.json({ error: "게시글을 찾을 수 없습니다" }, { status: 404 });
  }
  const isOwner = !existing[0].firebase_uid || existing[0].firebase_uid === user.uid;
  let isAdminUser = false;
  if (!isOwner && user.email) {
    try {
      const adminRows = await sql`SELECT id FROM admin_emails WHERE email = ${user.email.toLowerCase()} LIMIT 1`;
      isAdminUser = adminRows.length > 0;
    } catch { /* 테이블 미생성 시 무시 */ }
  }
  if (!isOwner && !isAdminUser) {
    return NextResponse.json({ error: "수정 권한이 없습니다" }, { status: 403 });
  }

  // is_closed만 업데이트하는 경우 (구인완료 처리)
  if (body.is_closed !== undefined && !body.title) {
    const closed = body.is_closed === true || body.is_closed === "true";
    await sql`
      UPDATE job_posts SET
        is_closed = ${closed},
        updated_at = NOW()
      WHERE id = ${Number(jobId)}
    `;
    invalidateCache("jobs:*").catch(() => {});
    return NextResponse.json({ success: true });
  }

  const {
    title, description, center_name, address,
    contact, sport, employment_type, salary,
    headcount, benefits, preferences, deadline,
  } = body;

  await sql`
    UPDATE job_posts SET
      title = ${sanitize(validateLength(title.trim(), 200))},
      description = ${sanitize(validateLength(description.trim(), 10000))},
      center_name = ${sanitize(validateLength(center_name.trim(), 100))},
      address = ${sanitize(validateLength((address || "").trim(), 200))},
      contact = ${sanitize(validateLength(contact.trim(), 100))},
      sport = ${sanitize(validateLength(sport.trim(), 50))},
      employment_type = ${sanitize(validateLength((employment_type || "").trim(), 50))},
      salary = ${sanitize(validateLength((salary || "").trim(), 100))},
      headcount = ${sanitize(validateLength((headcount || "").trim(), 50))},
      benefits = ${sanitize(validateLength((benefits || "").trim(), 500))},
      preferences = ${sanitize(validateLength((preferences || "").trim(), 500))},
      deadline = ${(deadline || "").trim()},
      updated_at = NOW()
    WHERE id = ${Number(jobId)}
  `;

  invalidateCache("jobs:*").catch(() => {});

  return NextResponse.json({ success: true });
}

// DELETE /api/jobs/[jobId] — 구인글 삭제 (인증 + 소유자 확인)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const user = await verifyAuth(request);
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const { jobId } = await params;

  // 소유자 또는 관리자 확인
  const existing = await sql`SELECT firebase_uid FROM job_posts WHERE id = ${Number(jobId)}`;
  if (existing.length === 0) {
    return NextResponse.json({ error: "게시글을 찾을 수 없습니다" }, { status: 404 });
  }
  const isOwnerDel = !existing[0].firebase_uid || existing[0].firebase_uid === user.uid;
  let isAdminDel = isAdminUid(user.uid);
  if (!isOwnerDel && !isAdminDel && user.email) {
    try {
      const adminRows = await sql`SELECT id FROM admin_emails WHERE email = ${user.email.toLowerCase()} LIMIT 1`;
      isAdminDel = adminRows.length > 0;
    } catch { /* ignore */ }
  }
  if (!isOwnerDel && !isAdminDel) {
    return NextResponse.json({ error: "삭제 권한이 없습니다" }, { status: 403 });
  }

  await sql`DELETE FROM job_post_likes WHERE job_post_id = ${Number(jobId)}`;
  await sql`DELETE FROM job_post_bookmarks WHERE job_post_id = ${Number(jobId)}`;
  await sql`DELETE FROM job_posts WHERE id = ${Number(jobId)}`;

  invalidateCache("jobs:*").catch(() => {});

  return NextResponse.json({ success: true });
}
