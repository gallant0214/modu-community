import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { sanitize, checkRateLimit, getClientIp, validateLength } from "@/app/lib/security";
import { verifyAuth, isAdminUid } from "@/app/lib/firebase-admin";
import { invalidateCache } from "@/app/lib/cache";
import { waitUntil } from "@vercel/functions";

export const dynamic = "force-dynamic";

async function checkIsAdmin(uid: string, email: string | null | undefined) {
  if (isAdminUid(uid)) return true;
  if (email) {
    const { count } = await supabase
      .from("admin_emails")
      .select("id", { count: "exact", head: true })
      .eq("email", email.toLowerCase());
    if ((count ?? 0) > 0) return true;
  }
  return false;
}

async function recomputePostCommentsCount(postId: number) {
  const { count } = await supabase
    .from("comments")
    .select("*", { count: "exact", head: true })
    .eq("post_id", postId);
  await supabase
    .from("posts")
    .update({ comments_count: count ?? 0 })
    .eq("id", postId);
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

  const { data: row, error: fetchErr } = await supabase
    .from("comments")
    .select("password, firebase_uid")
    .eq("id", Number(commentId))
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "댓글을 찾을 수 없습니다" }, { status: 404 });

  const isOwner = row.firebase_uid && row.firebase_uid === user.uid;
  const isAdminUser = await checkIsAdmin(user.uid, user.email);
  const isAdminPw = password && password === process.env.ADMIN_PASSWORD;
  const isLegacyPw = password && row.password && row.password === password;
  if (!isOwner && !isAdminUser && !isAdminPw && !isLegacyPw) {
    return NextResponse.json({ error: "본인 또는 관리자만 수정할 수 있습니다" }, { status: 403 });
  }

  const { error } = await supabase
    .from("comments")
    .update({
      content: sanitize(validateLength(content.trim(), 5000)),
      updated_at: new Date().toISOString(),
    })
    .eq("id", Number(commentId));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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

  const { error } = await supabase
    .from("comments")
    .update({ hidden })
    .eq("id", Number(commentId));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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

  const { data: row, error: fetchErr } = await supabase
    .from("comments")
    .select("password, firebase_uid, post_id")
    .eq("id", Number(commentId))
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "댓글을 찾을 수 없습니다" }, { status: 404 });

  const isOwner = row.firebase_uid && row.firebase_uid === user.uid;
  const isAdminUser = await checkIsAdmin(user.uid, user.email);
  const isAdminPw = password && password === process.env.ADMIN_PASSWORD;
  const isLegacyPw = password && row.password && row.password === password;
  if (!isOwner && !isAdminUser && !isAdminPw && !isLegacyPw) {
    return NextResponse.json({ error: "본인 또는 관리자만 삭제할 수 있습니다" }, { status: 403 });
  }

  const { error: delErr } = await supabase
    .from("comments")
    .delete()
    .eq("id", Number(commentId));
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  const pid = post_id || row.post_id;
  if (pid) await recomputePostCommentsCount(Number(pid));

  // 댓글 수 변경 → 리스트 캐시 무효화
  waitUntil(
    Promise.allSettled([
      invalidateCache("posts:latest:*"),
      invalidateCache("posts:popular:*"),
      invalidateCache("posts:cat:*"),
    ]),
  );

  return NextResponse.json({ success: true });
}
