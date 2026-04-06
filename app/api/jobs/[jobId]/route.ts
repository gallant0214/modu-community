import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";
import { verifyAuth, isAdminUid } from "@/app/lib/firebase-admin";
import { sanitize, checkRateLimit, getClientIp, validateLength } from "@/app/lib/security";

export const dynamic = "force-dynamic";

// GET /api/jobs/[jobId] — 구인글 상세 (공개)
export async function GET(
  _request: Request,
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

  return NextResponse.json({ ...rows[0], bookmark_count: bookmarkCount });
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

  // 소유자 확인 (firebase_uid 컬럼이 있는 경우)
  const existing = await sql`SELECT firebase_uid FROM job_posts WHERE id = ${Number(jobId)}`;
  if (existing.length === 0) {
    return NextResponse.json({ error: "게시글을 찾을 수 없습니다" }, { status: 404 });
  }
  // firebase_uid가 있으면 소유자만 수정 가능, 없으면 (기존 데이터) 허용
  if (existing[0].firebase_uid && existing[0].firebase_uid !== user.uid) {
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

  // 소유자 확인
  const existing = await sql`SELECT firebase_uid FROM job_posts WHERE id = ${Number(jobId)}`;
  if (existing.length === 0) {
    return NextResponse.json({ error: "게시글을 찾을 수 없습니다" }, { status: 404 });
  }
  if (existing[0].firebase_uid && existing[0].firebase_uid !== user.uid && !isAdminUid(user.uid)) {
    return NextResponse.json({ error: "삭제 권한이 없습니다" }, { status: 403 });
  }

  await sql`DELETE FROM job_post_likes WHERE job_post_id = ${Number(jobId)}`;
  await sql`DELETE FROM job_post_bookmarks WHERE job_post_id = ${Number(jobId)}`;
  await sql`DELETE FROM job_posts WHERE id = ${Number(jobId)}`;
  return NextResponse.json({ success: true });
}
