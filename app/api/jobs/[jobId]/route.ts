import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAuth, isAdminUid } from "@/app/lib/firebase-admin";
import { sanitize, checkRateLimit, getClientIp, validateLength } from "@/app/lib/security";
import { invalidateCache } from "@/app/lib/cache";

export const dynamic = "force-dynamic";

async function checkAdminEmail(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const { count } = await supabase
    .from("admin_emails")
    .select("id", { count: "exact", head: true })
    .eq("email", email.toLowerCase());
  return (count ?? 0) > 0;
}

// GET /api/jobs/[jobId] — 구인글 상세 (공개)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const id = Number(jobId);

  const { data: job, error } = await supabase
    .from("job_posts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!job) return NextResponse.json({ error: "게시글을 찾을 수 없습니다" }, { status: 404 });

  const { count: bookmarkCount } = await supabase
    .from("job_post_bookmarks")
    .select("*", { count: "exact", head: true })
    .eq("job_post_id", id);

  let isLiked = false;
  let isBookmarked = false;
  const user = await verifyAuth(request);
  if (user) {
    const [likeRes, bmRes] = await Promise.all([
      supabase
        .from("job_post_likes")
        .select("id", { head: true, count: "exact" })
        .eq("job_post_id", id)
        .eq("firebase_uid", user.uid),
      supabase
        .from("job_post_bookmarks")
        .select("id", { head: true, count: "exact" })
        .eq("job_post_id", id)
        .eq("firebase_uid", user.uid),
    ]);
    isLiked = (likeRes.count ?? 0) > 0;
    isBookmarked = (bmRes.count ?? 0) > 0;
  }

  return NextResponse.json({
    ...job,
    bookmark_count: bookmarkCount ?? 0,
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
  const id = Number(jobId);
  const body = await request.json();

  const { data: existing, error: fetchErr } = await supabase
    .from("job_posts")
    .select("firebase_uid")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "게시글을 찾을 수 없습니다" }, { status: 404 });

  const isOwner = !existing.firebase_uid || existing.firebase_uid === user.uid;
  let isAdminUser = false;
  if (!isOwner) {
    isAdminUser = isAdminUid(user.uid) || (await checkAdminEmail(user.email));
  }
  if (!isOwner && !isAdminUser) {
    return NextResponse.json({ error: "수정 권한이 없습니다" }, { status: 403 });
  }

  // is_closed만 업데이트하는 경우
  if (body.is_closed !== undefined && !body.title) {
    const closed = body.is_closed === true || body.is_closed === "true";
    const { error } = await supabase
      .from("job_posts")
      .update({ is_closed: closed, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await invalidateCache("jobs:*").catch(() => {});
    return NextResponse.json({ success: true });
  }

  const {
    title, description, center_name, address,
    contact, sport, employment_type, salary,
    headcount, benefits, preferences, deadline,
  } = body;

  const { error } = await supabase
    .from("job_posts")
    .update({
      title: sanitize(validateLength(title.trim(), 200)),
      description: sanitize(validateLength(description.trim(), 10000)),
      center_name: sanitize(validateLength(center_name.trim(), 100)),
      address: sanitize(validateLength((address || "").trim(), 200)),
      contact: sanitize(validateLength(contact.trim(), 100)),
      sport: sanitize(validateLength(sport.trim(), 50)),
      employment_type: sanitize(validateLength((employment_type || "").trim(), 50)),
      salary: sanitize(validateLength((salary || "").trim(), 100)),
      headcount: sanitize(validateLength((headcount || "").trim(), 50)),
      benefits: sanitize(validateLength((benefits || "").trim(), 500)),
      preferences: sanitize(validateLength((preferences || "").trim(), 500)),
      deadline: (deadline || "").trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await invalidateCache("jobs:*").catch(() => {});

  return NextResponse.json({ success: true });
}

// DELETE /api/jobs/[jobId] — 구인글 삭제
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const user = await verifyAuth(request);
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const { jobId } = await params;
  const id = Number(jobId);

  const { data: existing, error: fetchErr } = await supabase
    .from("job_posts")
    .select("firebase_uid")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "게시글을 찾을 수 없습니다" }, { status: 404 });

  const isOwnerDel = !existing.firebase_uid || existing.firebase_uid === user.uid;
  const isAdminDel = isAdminUid(user.uid) || (!isOwnerDel && (await checkAdminEmail(user.email)));
  if (!isOwnerDel && !isAdminDel) {
    return NextResponse.json({ error: "삭제 권한이 없습니다" }, { status: 403 });
  }

  await supabase.from("job_post_likes").delete().eq("job_post_id", id);
  await supabase.from("job_post_bookmarks").delete().eq("job_post_id", id);
  await supabase.from("job_posts").delete().eq("id", id);

  await invalidateCache("jobs:*").catch(() => {});

  return NextResponse.json({ success: true });
}
