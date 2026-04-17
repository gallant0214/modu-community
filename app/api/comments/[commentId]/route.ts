import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";
import { sanitize, checkRateLimit, getClientIp, validateLength } from "@/app/lib/security";
import { verifyAuth, isAdminUid } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

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
  { params }: { params: Promise<{ commentId: string }> }
) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인을 해주세요" }, { status: 401 });

  const ip = getClientIp(request);
  const rateLimitResponse = checkRateLimit(ip, "write");
  if (rateLimitResponse) return rateLimitResponse;

  const { commentId } = await params;
  const body = await request.json().catch(() => ({}));
  const { content, password } = body;

  if (!content?.trim()) {
    return NextResponse.json({ error: "내용을 입력해주세요" }, { status: 400 });
  }

  const rows = await sql`SELECT password, firebase_uid FROM comments WHERE id = ${Number(commentId)}`;
  if (rows.length === 0) {
    return NextResponse.json({ error: "댓글을 찾을 수 없습니다" }, { status: 404 });
  }

  const isOwner = rows[0].firebase_uid && rows[0].firebase_uid === user.uid;
  const isAdminUser = await checkIsAdmin(user.uid, user.email);
  const isAdminPw = password && password === process.env.ADMIN_PASSWORD;
  const isLegacyPw = password && rows[0].password && rows[0].password === password;
  if (!isOwner && !isAdminUser && !isAdminPw && !isLegacyPw) {
    return NextResponse.json({ error: "본인 또는 관리자만 수정할 수 있습니다" }, { status: 403 });
  }

  // updated_at 컬럼 없을 수 있으니 안전하게 추가
  try { await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`; } catch {}

  await sql`UPDATE comments SET content = ${sanitize(validateLength(content.trim(), 5000))}, updated_at = NOW() WHERE id = ${Number(commentId)}`;
  return NextResponse.json({ success: true });
}

// PATCH: 관리자 숨김 처리
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ commentId: string }> }
) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인을 해주세요" }, { status: 401 });

  const isAdminUser = await checkIsAdmin(user.uid, user.email);
  if (!isAdminUser) return NextResponse.json({ error: "관리자만 숨김 처리할 수 있습니다" }, { status: 403 });

  const { commentId } = await params;
  const body = await request.json().catch(() => ({}));
  const hidden = body.hidden !== false;

  await sql`UPDATE comments SET hidden = ${hidden} WHERE id = ${Number(commentId)}`;
  return NextResponse.json({ success: true, hidden });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ commentId: string }> }
) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인을 해주세요" }, { status: 401 });

  const ip = getClientIp(request);
  const rateLimitResponse = checkRateLimit(ip, "write");
  if (rateLimitResponse) return rateLimitResponse;

  const { commentId } = await params;
  const body = await request.json().catch(() => ({}));
  const { password, post_id } = body;

  const rows = await sql`SELECT password, firebase_uid, post_id FROM comments WHERE id = ${Number(commentId)}`;
  if (rows.length === 0) {
    return NextResponse.json({ error: "댓글을 찾을 수 없습니다" }, { status: 404 });
  }

  const isOwner = rows[0].firebase_uid && rows[0].firebase_uid === user.uid;
  const isAdminUser = await checkIsAdmin(user.uid, user.email);
  const isAdminPw = password && password === process.env.ADMIN_PASSWORD;
  const isLegacyPw = password && rows[0].password && rows[0].password === password;
  if (!isOwner && !isAdminUser && !isAdminPw && !isLegacyPw) {
    return NextResponse.json({ error: "본인 또는 관리자만 삭제할 수 있습니다" }, { status: 403 });
  }

  await sql`DELETE FROM comments WHERE id = ${Number(commentId)}`;
  const pid = post_id || rows[0].post_id;
  if (pid) {
    await sql`UPDATE posts SET comments_count = (SELECT COUNT(*) FROM comments WHERE post_id = ${Number(pid)}) WHERE id = ${Number(pid)}`;
  }
  return NextResponse.json({ success: true });
}
