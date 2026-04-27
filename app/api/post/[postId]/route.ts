import { supabase } from "@/app/lib/supabase";
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

  const { data: post, error } = await supabase
    .from("posts")
    .select(
      "id, category_id, title, content, author, region, tags, likes, comments_count, is_notice, views, created_at, updated_at, ip_address, firebase_uid, images, categories(name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!post) return NextResponse.json(null, { status: 404 });

  let isLiked = false;
  let isBookmarked = false;
  const user = await verifyAuth(request);
  if (user) {
    const [likeRes, bookmarkRes] = await Promise.all([
      supabase
        .from("post_likes")
        .select("id", { head: true, count: "exact" })
        .eq("post_id", id)
        .eq("firebase_uid", user.uid),
      supabase
        .from("post_bookmarks")
        .select("id", { head: true, count: "exact" })
        .eq("post_id", id)
        .eq("firebase_uid", user.uid),
    ]);
    isLiked = (likeRes.count ?? 0) > 0;
    isBookmarked = (bookmarkRes.count ?? 0) > 0;
  }

  const isMine = !!(user && post.firebase_uid && post.firebase_uid === user.uid);
  const { categories: cat, ...rest } = post;
  return NextResponse.json({
    ...rest,
    category_name: cat?.name ?? null,
    firebase_uid: undefined,
    ip_display: maskIp(post.ip_address || ""),
    ip_address: undefined,
    password: undefined,
    is_liked: isLiked,
    is_bookmarked: isBookmarked,
    is_mine: isMine,
  });
}

async function checkIsAdmin(uid: string, email: string | null | undefined) {
  if (isAdminUid(uid)) return true;
  if (email) {
    const { count } = await supabase
      .from("admin_emails")
      .select("id", { head: true, count: "exact" })
      .eq("email", email.toLowerCase());
    if ((count ?? 0) > 0) return true;
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
  const id = Number(postId);
  const { title, content, region, tags, images } = await request.json();

  if (!title?.trim() || !content?.trim()) {
    return NextResponse.json({ error: "제목과 내용을 입력해주세요" }, { status: 400 });
  }

  const { data: owner, error: ownerErr } = await supabase
    .from("posts")
    .select("firebase_uid, category_id")
    .eq("id", id)
    .maybeSingle();
  if (ownerErr) return NextResponse.json({ error: ownerErr.message }, { status: 500 });
  if (!owner) return NextResponse.json({ error: "게시글을 찾을 수 없습니다" }, { status: 404 });

  const isOwner = owner.firebase_uid && owner.firebase_uid === user.uid;
  const isAdminUser = await checkIsAdmin(user.uid, user.email);
  if (!isOwner && !isAdminUser) {
    return NextResponse.json({ error: "본인 또는 관리자만 수정할 수 있습니다" }, { status: 403 });
  }

  const { error: updateErr } = await supabase
    .from("posts")
    .update({
      title: sanitize(validateLength(title.trim(), 200)),
      content: validateLength(content.trim(), 50000),
      region: sanitize(validateLength(region || "", 50)),
      tags: sanitize(validateLength(tags || "", 200)),
      images: (images || "").trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  revalidatePath("/community");
  revalidatePath(`/category/${owner.category_id}`);
  revalidatePath(`/category/${owner.category_id}/post/${postId}`);

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
  const id = Number(postId);
  const body = await request.json().catch(() => ({}));
  const { password } = body;

  const { data: existing, error: fetchErr } = await supabase
    .from("posts")
    .select("password, firebase_uid, category_id")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "게시글을 찾을 수 없습니다" }, { status: 404 });

  const isOwner = existing.firebase_uid && existing.firebase_uid === user.uid;
  const isAdminUser = await checkIsAdmin(user.uid, user.email);
  const isAdminPw = password && password === process.env.ADMIN_PASSWORD;
  const isLegacyPw = password && existing.password && existing.password === password;
  if (!isOwner && !isAdminUser && !isAdminPw && !isLegacyPw) {
    return NextResponse.json({ error: "본인 또는 관리자만 삭제할 수 있습니다" }, { status: 403 });
  }

  const { error: delErr } = await supabase.from("posts").delete().eq("id", id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  revalidatePath("/community");
  revalidatePath(`/category/${existing.category_id}`);
  revalidatePath(`/category/${existing.category_id}/post/${id}`);

  await invalidateCache("posts:*").catch(() => {});
  await invalidateCache(`post:${id}:*`).catch(() => {});

  return NextResponse.json({ success: true });
}
