"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { supabase } from "./supabase";
import { verifyAdminPassword } from "./admin-auth";
import { verifyIdTokenString } from "./firebase-admin";

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

export async function createPost(formData: FormData) {
  const idToken = (formData.get("id_token") as string) || "";
  const user = await verifyIdTokenString(idToken);
  if (!user) {
    return { error: "로그인이 필요합니다" };
  }

  const categoryId = formData.get("category_id") as string;
  const title = formData.get("title") as string;
  const content = formData.get("content") as string;
  const author = formData.get("author") as string;
  const password = formData.get("password") as string;
  const region = formData.get("region") as string;
  const tags = formData.get("tags") as string;
  const images = formData.get("images") as string;

  if (!title?.trim() || !content?.trim() || !author?.trim()) {
    return { error: "필수 항목을 입력해주세요" };
  }

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";

  await supabase.from("posts").insert({
    category_id: Number(categoryId),
    title: title.trim(),
    content: content.trim(),
    author: author.trim(),
    password: (password || "__auth__").trim(),
    region: (region || "전국").trim(),
    tags: (tags || "").trim(),
    ip_address: ip,
    firebase_uid: user.uid,
    images: (images || "").trim(),
  });
  revalidatePath(`/category/${categoryId}`);
  revalidatePath("/");
}

export async function likePost(id: number, categoryId: number, idToken?: string) {
  const user = await verifyIdTokenString(idToken);
  if (!user) return { error: "로그인이 필요합니다" };

  const { data: existing } = await supabase
    .from("post_likes")
    .select("id")
    .eq("post_id", id)
    .eq("firebase_uid", user.uid)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("post_likes")
      .delete()
      .eq("post_id", id)
      .eq("firebase_uid", user.uid);
    await supabase.rpc("adjust_post_counter", { p_id: id, p_col: "likes", p_delta: -1 });
    revalidatePath(`/category/${categoryId}`);
    return { unliked: true };
  }

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  await supabase.from("post_likes").insert({ post_id: id, ip_address: ip, firebase_uid: user.uid });
  await supabase.rpc("adjust_post_counter", { p_id: id, p_col: "likes", p_delta: 1 });
  revalidatePath(`/category/${categoryId}`);
  return { unliked: false };
}

export async function viewPost(id: number) {
  if (!Number.isFinite(id) || id <= 0) return;
  await supabase.rpc("increment_post_views", { p_id: id });
}

export async function updatePost(formData: FormData) {
  const idToken = (formData.get("id_token") as string) || "";
  const user = await verifyIdTokenString(idToken);
  if (!user) return { error: "로그인이 필요합니다" };

  const id = formData.get("id") as string;
  const categoryId = formData.get("category_id") as string;
  const title = formData.get("title") as string;
  const content = formData.get("content") as string;
  const region = formData.get("region") as string;
  const tags = formData.get("tags") as string;

  if (!title?.trim() || !content?.trim()) {
    return { error: "제목과 내용을 입력해주세요" };
  }

  const { data: row } = await supabase
    .from("posts")
    .select("firebase_uid")
    .eq("id", Number(id))
    .maybeSingle();
  if (!row) return { error: "게시글을 찾을 수 없습니다" };
  const isOwner = row.firebase_uid && row.firebase_uid === user.uid;
  if (!isOwner) return { error: "본인이 작성한 글만 수정할 수 있습니다" };

  await supabase
    .from("posts")
    .update({
      title: title.trim(),
      content: content.trim(),
      region: region || "",
      tags: tags || "",
      updated_at: new Date().toISOString(),
    })
    .eq("id", Number(id));
  revalidatePath(`/category/${categoryId}`);
}

export async function verifyPostPassword(id: number, password: string) {
  const { data: row } = await supabase
    .from("posts")
    .select("password")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { error: "게시글을 찾을 수 없습니다" };

  const isAdmin = await verifyAdminPassword(password);
  if (!isAdmin && row.password !== password) {
    return { error: "비밀번호가 일치하지 않습니다" };
  }
  return { success: true };
}

export async function deletePost(id: number, categoryId: number, password: string, idToken?: string) {
  const user = await verifyIdTokenString(idToken);
  const { data: row } = await supabase
    .from("posts")
    .select("password, firebase_uid")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { error: "게시글을 찾을 수 없습니다" };

  const isOwner = user && row.firebase_uid && row.firebase_uid === user.uid;
  const isAdminPw = await verifyAdminPassword(password);
  const isLegacyPw = password && row.password && row.password === password;
  if (!isOwner && !isAdminPw && !isLegacyPw) {
    return { error: "본인 또는 관리자만 삭제할 수 있습니다" };
  }

  await supabase.from("posts").delete().eq("id", id);
  revalidatePath(`/category/${categoryId}`);
  revalidatePath("/");
}

export async function createComment(postId: number, categoryId: number, author: string, password: string, content: string, parentId?: number | null, idToken?: string) {
  const user = await verifyIdTokenString(idToken);
  if (!user) return { error: "로그인이 필요합니다" };

  if (!author?.trim() || !content?.trim()) {
    return { error: "모든 항목을 입력해주세요" };
  }

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";

  await supabase.from("comments").insert({
    post_id: postId,
    parent_id: parentId ?? null,
    author: author.trim(),
    password: (password || "__auth__").trim(),
    content: content.trim(),
    ip_address: ip,
    firebase_uid: user.uid,
  });
  await recomputePostCommentsCount(postId);
  revalidatePath(`/category/${categoryId}/post/${postId}`);
  revalidatePath(`/category/${categoryId}`);
}

export async function deleteComment(commentId: number, postId: number, categoryId: number, password: string, idToken?: string) {
  const user = await verifyIdTokenString(idToken);
  const { data: row } = await supabase
    .from("comments")
    .select("password, firebase_uid")
    .eq("id", commentId)
    .maybeSingle();
  if (!row) return { error: "댓글을 찾을 수 없습니다" };

  const isOwner = user && row.firebase_uid && row.firebase_uid === user.uid;
  const isAdminPw = await verifyAdminPassword(password);
  const isLegacyPw = password && row.password && row.password === password;
  if (!isOwner && !isAdminPw && !isLegacyPw) {
    return { error: "본인 또는 관리자만 삭제할 수 있습니다" };
  }

  await supabase.from("comments").delete().eq("id", commentId);
  await recomputePostCommentsCount(postId);
  revalidatePath(`/category/${categoryId}/post/${postId}`);
  revalidatePath(`/category/${categoryId}`);
}

export async function createInquiry(formData: FormData) {
  const idToken = (formData.get("id_token") as string) || "";
  const user = await verifyIdTokenString(idToken);
  if (!user) return { error: "로그인이 필요합니다" };

  const author = formData.get("author") as string;
  const password = formData.get("password") as string;
  const email = formData.get("email") as string;
  const title = formData.get("title") as string;
  const content = formData.get("content") as string;

  if (!author?.trim() || !title?.trim() || !content?.trim()) {
    return { error: "모든 항목을 입력해주세요" };
  }

  await supabase.from("inquiries").insert({
    author: author.trim(),
    password: (password || "__auth__").trim(),
    email: (email || user.email || "").trim(),
    title: title.trim(),
    content: content.trim(),
    firebase_uid: user.uid,
  });
  revalidatePath("/inquiry");
}

export async function viewInquiry(id: number, password: string) {
  const { data: row } = await supabase
    .from("inquiries")
    .select("id, author, title, content, reply, replied_at, password, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { error: "문의를 찾을 수 없습니다" };
  if (row.password !== password) return { error: "비밀번호가 일치하지 않습니다" };
  return {
    content: row.content,
    reply: row.reply,
    replied_at: row.replied_at,
    isAdmin: false,
  };
}

export async function viewInquiryAdmin(id: number, adminPassword: string) {
  if (!(await verifyAdminPassword(adminPassword))) {
    return { error: "관리자 비밀번호가 일치하지 않습니다" };
  }
  const { data: row } = await supabase
    .from("inquiries")
    .select("content, reply, replied_at")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { error: "문의를 찾을 수 없습니다" };
  return {
    content: row.content,
    reply: row.reply,
    replied_at: row.replied_at,
    isAdmin: true,
  };
}

export async function replyToInquiry(id: number, adminPassword: string, replyContent: string) {
  if (!(await verifyAdminPassword(adminPassword))) {
    return { error: "관리자 비밀번호가 일치하지 않습니다" };
  }
  if (!replyContent?.trim()) {
    return { error: "답글 내용을 입력해주세요" };
  }
  await supabase
    .from("inquiries")
    .update({ reply: replyContent.trim(), replied_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/inquiry");
}

export async function updateInquiry(id: number, password: string, title: string, content: string, idToken?: string) {
  const user = await verifyIdTokenString(idToken);
  const { data: row } = await supabase
    .from("inquiries")
    .select("password, firebase_uid, email")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { error: "문의를 찾을 수 없습니다" };

  const isOwner = user && (
    (row.firebase_uid && row.firebase_uid === user.uid) ||
    (user.email && row.email && row.email === user.email)
  );
  const isAdminPw = password && await verifyAdminPassword(password);
  const isLegacyPw = password && row.password && row.password === password;
  if (!isOwner && !isAdminPw && !isLegacyPw) {
    return { error: "본인 또는 관리자만 수정할 수 있습니다" };
  }
  if (!title?.trim() || !content?.trim()) {
    return { error: "제목과 내용을 입력해주세요" };
  }

  await supabase
    .from("inquiries")
    .update({ title: title.trim(), content: content.trim() })
    .eq("id", id);
  revalidatePath("/inquiry");
}

export async function updateNotice(id: number, adminPassword: string, title: string, content: string) {
  if (!(await verifyAdminPassword(adminPassword))) {
    return { error: "관리자 비밀번호가 일치하지 않습니다" };
  }
  if (!title?.trim() || !content?.trim()) {
    return { error: "제목과 내용을 입력해주세요" };
  }
  const { data: row } = await supabase
    .from("posts")
    .select("id")
    .eq("id", id)
    .eq("is_notice", true)
    .maybeSingle();
  if (!row) return { error: "공지를 찾을 수 없습니다" };
  await supabase
    .from("posts")
    .update({
      title: title.trim(),
      content: content.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  revalidatePath("/", "layout");
}

export async function createReport(
  targetType: "post" | "comment",
  targetId: number,
  postId: number,
  categoryId: number,
  reason: string,
  customReason?: string,
  idToken?: string,
) {
  const user = await verifyIdTokenString(idToken);
  if (!user) return { error: "로그인이 필요합니다" };
  if (!reason?.trim()) return { error: "신고 사유를 선택해주세요" };
  await supabase.from("reports").insert({
    target_type: targetType,
    target_id: targetId,
    post_id: postId,
    category_id: categoryId,
    reason: reason.trim(),
    custom_reason: customReason?.trim() || null,
  });
}

export async function getReports(adminPassword: string) {
  if (!(await verifyAdminPassword(adminPassword))) {
    return { error: "관리자 비밀번호가 일치하지 않습니다" };
  }
  try {
    const { loadEnrichedReports } = await import("./admin-data");
    const reports = await loadEnrichedReports();
    return { reports };
  } catch (e: any) {
    console.error("[actions] getReports failed:", e);
    return { error: e?.message || "신고 목록을 불러올 수 없습니다" };
  }
}

export async function getInquiries(adminPassword: string) {
  if (!(await verifyAdminPassword(adminPassword))) {
    return { error: "관리자 비밀번호가 일치하지 않습니다" };
  }
  try {
    const { loadEnrichedInquiries } = await import("./admin-data");
    const inquiries = await loadEnrichedInquiries();
    return { inquiries };
  } catch (e: any) {
    console.error("[actions] getInquiries failed:", e);
    return { error: e?.message || "문의 목록을 불러올 수 없습니다" };
  }
}

export async function resolveReport(id: number, adminPassword: string) {
  if (!(await verifyAdminPassword(adminPassword))) {
    return { error: "관리자 비밀번호가 일치하지 않습니다" };
  }
  await supabase
    .from("reports")
    .update({ resolved: true, resolved_at: new Date().toISOString() })
    .eq("id", id);
}

export async function deleteReportTarget(reportId: number, adminPassword: string) {
  if (!(await verifyAdminPassword(adminPassword))) {
    return { error: "관리자 비밀번호가 일치하지 않습니다" };
  }
  const { data: row } = await supabase
    .from("reports")
    .select("target_type, target_id, post_id, category_id")
    .eq("id", reportId)
    .maybeSingle();
  if (!row) return { error: "신고를 찾을 수 없습니다" };

  const { target_type, target_id, post_id, category_id } = row;

  if (target_type === "post") {
    await supabase.from("comments").delete().eq("post_id", target_id);
    await supabase.from("posts").delete().eq("id", target_id);
  } else {
    await supabase.from("comments").delete().eq("id", target_id);
    if (post_id) await recomputePostCommentsCount(post_id);
  }

  await supabase
    .from("reports")
    .update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      deleted_at: new Date().toISOString(),
    })
    .eq("id", reportId);
  revalidatePath(`/category/${category_id}`);
}

export async function hideInquiry(id: number, adminPassword: string) {
  if (!(await verifyAdminPassword(adminPassword))) {
    return { error: "관리자 비밀번호가 일치하지 않습니다" };
  }
  await supabase.from("inquiries").update({ hidden: true }).eq("id", id);
  revalidatePath("/inquiry");
}

export async function unhideInquiry(id: number, adminPassword: string) {
  if (!(await verifyAdminPassword(adminPassword))) {
    return { error: "관리자 비밀번호가 일치하지 않습니다" };
  }
  await supabase.from("inquiries").update({ hidden: false }).eq("id", id);
  revalidatePath("/inquiry");
}

export async function deleteInquiry(id: number, password: string, idToken?: string) {
  const user = await verifyIdTokenString(idToken);
  const { data: row } = await supabase
    .from("inquiries")
    .select("password, firebase_uid, email")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { error: "문의를 찾을 수 없습니다" };

  const isOwner = user && (
    (row.firebase_uid && row.firebase_uid === user.uid) ||
    (user.email && row.email && row.email === user.email)
  );
  const isAdminPw = password && await verifyAdminPassword(password);
  const isLegacyPw = password && row.password && row.password === password;
  if (!isOwner && !isAdminPw && !isLegacyPw) {
    return { error: "본인 또는 관리자만 삭제할 수 있습니다" };
  }

  await supabase.from("inquiries").delete().eq("id", id);
  revalidatePath("/inquiry");
}

export async function updateComment(commentId: number, postId: number, categoryId: number, password: string, content: string, idToken?: string) {
  if (!content?.trim()) return { error: "내용을 입력해주세요" };

  const user = await verifyIdTokenString(idToken);
  const { data: row } = await supabase
    .from("comments")
    .select("password, firebase_uid")
    .eq("id", commentId)
    .maybeSingle();
  if (!row) return { error: "댓글을 찾을 수 없습니다" };

  const isOwner = user && row.firebase_uid && row.firebase_uid === user.uid;
  const isAdminPw = password && await verifyAdminPassword(password);
  const isLegacyPw = password && row.password && row.password === password;
  if (!isOwner && !isAdminPw && !isLegacyPw) {
    return { error: "본인 또는 관리자만 수정할 수 있습니다" };
  }

  await supabase
    .from("comments")
    .update({ content: content.trim(), updated_at: new Date().toISOString() })
    .eq("id", commentId);
  revalidatePath(`/category/${categoryId}/post/${postId}`);
}

export async function likeComment(commentId: number, postId: number, categoryId: number, idToken?: string) {
  const user = await verifyIdTokenString(idToken);
  if (!user) return { error: "로그인이 필요합니다" };

  const { data: existing } = await supabase
    .from("comment_likes")
    .select("id")
    .eq("comment_id", commentId)
    .eq("firebase_uid", user.uid)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("comment_likes")
      .delete()
      .eq("comment_id", commentId)
      .eq("firebase_uid", user.uid);
    await supabase.rpc("adjust_comments_counter", { p_id: commentId, p_col: "likes", p_delta: -1 });
    revalidatePath(`/category/${categoryId}/post/${postId}`);
    return { unliked: true };
  }

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  await supabase.from("comment_likes").insert({ comment_id: commentId, ip_address: ip, firebase_uid: user.uid });
  await supabase.rpc("adjust_comments_counter", { p_id: commentId, p_col: "likes", p_delta: 1 });
  revalidatePath(`/category/${categoryId}/post/${postId}`);
}
