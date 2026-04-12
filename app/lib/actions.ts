"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { sql } from "./db";
import { verifyAdminPassword } from "./admin-auth";
import { verifyIdTokenString } from "./firebase-admin";

export async function createPost(formData: FormData) {
  // 인증: formData에 id_token이 있으면 검증, 없으면 거부
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

  if (!title?.trim() || !content?.trim() || !author?.trim()) {
    return { error: "필수 항목을 입력해주세요" };
  }

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";

  await sql`INSERT INTO posts (category_id, title, content, author, password, region, tags, ip_address, firebase_uid)
    VALUES (${Number(categoryId)}, ${title.trim()}, ${content.trim()}, ${author.trim()}, ${(password || "__auth__").trim()}, ${(region || "전국").trim()}, ${(tags || "").trim()}, ${ip}, ${user.uid})`;
  revalidatePath(`/category/${categoryId}`);
  revalidatePath("/");
}

export async function likePost(id: number, categoryId: number, idToken?: string) {
  // 인증 필수: 좋아요 조작 방어
  const user = await verifyIdTokenString(idToken);
  if (!user) return { error: "로그인이 필요합니다" };

  // uid 기반 좋아요 (IP 대체)
  const existing = await sql`SELECT id FROM post_likes WHERE post_id = ${id} AND firebase_uid = ${user.uid} LIMIT 1`;
  if (existing.length > 0) {
    await sql`DELETE FROM post_likes WHERE post_id = ${id} AND firebase_uid = ${user.uid}`;
    await sql`UPDATE posts SET likes = GREATEST(COALESCE(likes, 0) - 1, 0) WHERE id = ${id}`;
    revalidatePath(`/category/${categoryId}`);
    return { unliked: true };
  }

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  await sql`INSERT INTO post_likes (post_id, ip_address, firebase_uid) VALUES (${id}, ${ip}, ${user.uid})`;
  await sql`UPDATE posts SET likes = COALESCE(likes, 0) + 1 WHERE id = ${id}`;
  revalidatePath(`/category/${categoryId}`);
  return { unliked: false };
}

export async function viewPost(id: number) {
  // viewPost는 익명 허용 (조회수는 가벼운 카운터이며 실제 방어는 rate limit에 맡김)
  // 단, 한 번의 호출로 무한 증분되지 않도록 기본 유효성만 확인
  if (!Number.isFinite(id) || id <= 0) return;
  await sql`UPDATE posts SET views = views + 1 WHERE id = ${id}`;
}

export async function updatePost(formData: FormData) {
  // 인증: 토큰 필수 + 소유권 검증
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

  // 소유권 검증 (본인이거나 관리자)
  const rows = await sql`SELECT firebase_uid FROM posts WHERE id = ${Number(id)}`;
  if (rows.length === 0) return { error: "게시글을 찾을 수 없습니다" };
  const isOwner = rows[0].firebase_uid && rows[0].firebase_uid === user.uid;
  if (!isOwner) return { error: "본인이 작성한 글만 수정할 수 있습니다" };

  await sql`
    UPDATE posts
    SET title = ${title.trim()}, content = ${content.trim()}, region = ${region || ""}, tags = ${tags || ""}, updated_at = NOW()
    WHERE id = ${Number(id)}
  `;
  revalidatePath(`/category/${categoryId}`);
}

export async function verifyPostPassword(id: number, password: string) {
  const rows = await sql`SELECT password FROM posts WHERE id = ${id}`;
  if (rows.length === 0) return { error: "게시글을 찾을 수 없습니다" };

  const isAdmin = await verifyAdminPassword(password);
  if (!isAdmin && rows[0].password !== password) {
    return { error: "비밀번호가 일치하지 않습니다" };
  }
  return { success: true };
}

export async function deletePost(id: number, categoryId: number, password: string, idToken?: string) {
  // 본인 토큰 경로 우선. 토큰이 없으면 기존 비밀번호 플로우(레거시) 유지.
  const user = await verifyIdTokenString(idToken);
  const rows = await sql`SELECT password, firebase_uid FROM posts WHERE id = ${id}`;
  if (rows.length === 0) return { error: "게시글을 찾을 수 없습니다" };

  const isOwner = user && rows[0].firebase_uid && rows[0].firebase_uid === user.uid;
  const isAdminPw = await verifyAdminPassword(password);
  const isLegacyPw = password && rows[0].password && rows[0].password === password;
  if (!isOwner && !isAdminPw && !isLegacyPw) {
    return { error: "본인 또는 관리자만 삭제할 수 있습니다" };
  }

  await sql`DELETE FROM posts WHERE id = ${id}`;
  revalidatePath(`/category/${categoryId}`);
  revalidatePath("/");
}

export async function createComment(postId: number, categoryId: number, author: string, password: string, content: string, parentId?: number | null, idToken?: string) {
  // 인증 필수: 누구나 댓글 spam 하지 못하도록
  const user = await verifyIdTokenString(idToken);
  if (!user) return { error: "로그인이 필요합니다" };

  if (!author?.trim() || !content?.trim()) {
    return { error: "모든 항목을 입력해주세요" };
  }

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";

  await sql`INSERT INTO comments (post_id, parent_id, author, password, content, ip_address, firebase_uid) VALUES (${postId}, ${parentId ?? null}, ${author.trim()}, ${(password || "__auth__").trim()}, ${content.trim()}, ${ip}, ${user.uid})`;
  await sql`UPDATE posts SET comments_count = (SELECT COUNT(*) FROM comments WHERE post_id = ${postId}) WHERE id = ${postId}`;
  revalidatePath(`/category/${categoryId}/post/${postId}`);
  revalidatePath(`/category/${categoryId}`);
}

export async function deleteComment(commentId: number, postId: number, categoryId: number, password: string, idToken?: string) {
  const user = await verifyIdTokenString(idToken);
  const rows = await sql`SELECT password, firebase_uid FROM comments WHERE id = ${commentId}`;
  if (rows.length === 0) return { error: "댓글을 찾을 수 없습니다" };

  const isOwner = user && rows[0].firebase_uid && rows[0].firebase_uid === user.uid;
  const isAdminPw = await verifyAdminPassword(password);
  const isLegacyPw = password && rows[0].password && rows[0].password === password;
  if (!isOwner && !isAdminPw && !isLegacyPw) {
    return { error: "본인 또는 관리자만 삭제할 수 있습니다" };
  }

  await sql`DELETE FROM comments WHERE id = ${commentId}`;
  await sql`UPDATE posts SET comments_count = (SELECT COUNT(*) FROM comments WHERE post_id = ${postId}) WHERE id = ${postId}`;
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

  await sql`INSERT INTO inquiries (author, password, email, title, content, firebase_uid)
    VALUES (${author.trim()}, ${(password || "__auth__").trim()}, ${(email || user.email || "").trim()}, ${title.trim()}, ${content.trim()}, ${user.uid})`;
  revalidatePath("/inquiry");
}

export async function viewInquiry(id: number, password: string) {
  const rows = await sql`SELECT id, author, title, content, reply, replied_at, password, created_at FROM inquiries WHERE id = ${id}`;
  if (rows.length === 0) return { error: "문의를 찾을 수 없습니다" };
  if (rows[0].password !== password) return { error: "비밀번호가 일치하지 않습니다" };
  return {
    content: rows[0].content as string,
    reply: rows[0].reply as string | null,
    replied_at: rows[0].replied_at as string | null,
    isAdmin: false,
  };
}

export async function viewInquiryAdmin(id: number, adminPassword: string) {
  if (!(await verifyAdminPassword(adminPassword))) {
    return { error: "관리자 비밀번호가 일치하지 않습니다" };
  }
  const rows = await sql`SELECT content, reply, replied_at FROM inquiries WHERE id = ${id}`;
  if (rows.length === 0) return { error: "문의를 찾을 수 없습니다" };
  return {
    content: rows[0].content as string,
    reply: rows[0].reply as string | null,
    replied_at: rows[0].replied_at as string | null,
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
  await sql`UPDATE inquiries SET reply = ${replyContent.trim()}, replied_at = NOW() WHERE id = ${id}`;
  revalidatePath("/inquiry");
}

export async function updateInquiry(id: number, password: string, title: string, content: string, idToken?: string) {
  const user = await verifyIdTokenString(idToken);
  const rows = await sql`SELECT password, firebase_uid, email FROM inquiries WHERE id = ${id}`;
  if (rows.length === 0) return { error: "문의를 찾을 수 없습니다" };

  const isOwner = user && (
    (rows[0].firebase_uid && rows[0].firebase_uid === user.uid) ||
    (user.email && rows[0].email && rows[0].email === user.email)
  );
  const isAdminPw = password && await verifyAdminPassword(password);
  const isLegacyPw = password && rows[0].password && rows[0].password === password;
  if (!isOwner && !isAdminPw && !isLegacyPw) {
    return { error: "본인 또는 관리자만 수정할 수 있습니다" };
  }
  if (!title?.trim() || !content?.trim()) {
    return { error: "제목과 내용을 입력해주세요" };
  }

  await sql`UPDATE inquiries SET title = ${title.trim()}, content = ${content.trim()} WHERE id = ${id}`;
  revalidatePath("/inquiry");
}

export async function updateNotice(id: number, adminPassword: string, title: string, content: string) {
  if (!(await verifyAdminPassword(adminPassword))) {
    return { error: "관리자 비밀번호가 일치하지 않습니다" };
  }
  if (!title?.trim() || !content?.trim()) {
    return { error: "제목과 내용을 입력해주세요" };
  }
  const rows = await sql`SELECT id FROM posts WHERE id = ${id} AND is_notice = true`;
  if (rows.length === 0) return { error: "공지를 찾을 수 없습니다" };
  await sql`UPDATE posts SET title = ${title.trim()}, content = ${content.trim()}, updated_at = NOW() WHERE id = ${id}`;
  // 공지는 모든 카테고리에 표시되므로 전체 revalidate
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
  // 인증 필수: 신고 기능 악용 방어
  const user = await verifyIdTokenString(idToken);
  if (!user) return { error: "로그인이 필요합니다" };
  if (!reason?.trim()) return { error: "신고 사유를 선택해주세요" };
  await sql`INSERT INTO reports (target_type, target_id, post_id, category_id, reason, custom_reason)
    VALUES (${targetType}, ${targetId}, ${postId}, ${categoryId}, ${reason.trim()}, ${customReason?.trim() || null})`;
}

export async function getReports(adminPassword: string) {
  if (!(await verifyAdminPassword(adminPassword))) {
    return { error: "관리자 비밀번호가 일치하지 않습니다" };
  }
  const rows = await sql`
    SELECT r.*,
      p.title AS post_title, p.author AS post_author,
      c.content AS comment_content, c.author AS comment_author,
      cat.name AS category_name
    FROM reports r
    LEFT JOIN posts p ON r.post_id = p.id
    LEFT JOIN comments c ON r.target_type = 'comment' AND r.target_id = c.id
    LEFT JOIN categories cat ON r.category_id = cat.id
    ORDER BY r.created_at DESC
  `;
  return { reports: rows };
}

export async function getInquiries(adminPassword: string) {
  if (!(await verifyAdminPassword(adminPassword))) {
    return { error: "관리자 비밀번호가 일치하지 않습니다" };
  }
  const rows = await sql`
    SELECT id, author, email, title, content, reply, replied_at, hidden, created_at
    FROM inquiries ORDER BY created_at DESC
  `;
  return { inquiries: rows };
}

export async function resolveReport(id: number, adminPassword: string) {
  if (!(await verifyAdminPassword(adminPassword))) {
    return { error: "관리자 비밀번호가 일치하지 않습니다" };
  }
  await sql`UPDATE reports SET resolved = true, resolved_at = NOW() WHERE id = ${id}`;
}

export async function deleteReportTarget(reportId: number, adminPassword: string) {
  if (!(await verifyAdminPassword(adminPassword))) {
    return { error: "관리자 비밀번호가 일치하지 않습니다" };
  }
  const rows = await sql`SELECT target_type, target_id, post_id, category_id FROM reports WHERE id = ${reportId}`;
  if (rows.length === 0) return { error: "신고를 찾을 수 없습니다" };

  const { target_type, target_id, post_id, category_id } = rows[0];

  if (target_type === "post") {
    await sql`DELETE FROM comments WHERE post_id = ${target_id}`;
    await sql`DELETE FROM posts WHERE id = ${target_id}`;
  } else {
    await sql`DELETE FROM comments WHERE id = ${target_id}`;
    await sql`UPDATE posts SET comments_count = (SELECT COUNT(*) FROM comments WHERE post_id = ${post_id}) WHERE id = ${post_id}`;
  }

  await sql`UPDATE reports SET resolved = true, resolved_at = NOW(), deleted_at = NOW() WHERE id = ${reportId}`;
  revalidatePath(`/category/${category_id}`);
}

export async function hideInquiry(id: number, adminPassword: string) {
  if (!(await verifyAdminPassword(adminPassword))) {
    return { error: "관리자 비밀번호가 일치하지 않습니다" };
  }
  await sql`UPDATE inquiries SET hidden = true WHERE id = ${id}`;
  revalidatePath("/inquiry");
}

export async function unhideInquiry(id: number, adminPassword: string) {
  if (!(await verifyAdminPassword(adminPassword))) {
    return { error: "관리자 비밀번호가 일치하지 않습니다" };
  }
  await sql`UPDATE inquiries SET hidden = false WHERE id = ${id}`;
  revalidatePath("/inquiry");
}

export async function deleteInquiry(id: number, password: string, idToken?: string) {
  const user = await verifyIdTokenString(idToken);
  const rows = await sql`SELECT password, firebase_uid, email FROM inquiries WHERE id = ${id}`;
  if (rows.length === 0) return { error: "문의를 찾을 수 없습니다" };

  const isOwner = user && (
    (rows[0].firebase_uid && rows[0].firebase_uid === user.uid) ||
    (user.email && rows[0].email && rows[0].email === user.email)
  );
  const isAdminPw = password && await verifyAdminPassword(password);
  const isLegacyPw = password && rows[0].password && rows[0].password === password;
  if (!isOwner && !isAdminPw && !isLegacyPw) {
    return { error: "본인 또는 관리자만 삭제할 수 있습니다" };
  }

  await sql`DELETE FROM inquiries WHERE id = ${id}`;
  revalidatePath("/inquiry");
}

export async function updateComment(commentId: number, postId: number, categoryId: number, password: string, content: string, idToken?: string) {
  if (!content?.trim()) return { error: "내용을 입력해주세요" };

  const user = await verifyIdTokenString(idToken);
  const rows = await sql`SELECT password, firebase_uid FROM comments WHERE id = ${commentId}`;
  if (rows.length === 0) return { error: "댓글을 찾을 수 없습니다" };

  const isOwner = user && rows[0].firebase_uid && rows[0].firebase_uid === user.uid;
  const isAdminPw = password && await verifyAdminPassword(password);
  const isLegacyPw = password && rows[0].password && rows[0].password === password;
  if (!isOwner && !isAdminPw && !isLegacyPw) {
    return { error: "본인 또는 관리자만 수정할 수 있습니다" };
  }

  await sql`UPDATE comments SET content = ${content.trim()} WHERE id = ${commentId}`;
  revalidatePath(`/category/${categoryId}/post/${postId}`);
}

export async function likeComment(commentId: number, postId: number, categoryId: number, idToken?: string) {
  // 인증 필수: 좋아요 조작 방어
  const user = await verifyIdTokenString(idToken);
  if (!user) return { error: "로그인이 필요합니다" };

  const existing = await sql`SELECT id FROM comment_likes WHERE comment_id = ${commentId} AND firebase_uid = ${user.uid} LIMIT 1`;
  if (existing.length > 0) {
    await sql`DELETE FROM comment_likes WHERE comment_id = ${commentId} AND firebase_uid = ${user.uid}`;
    await sql`UPDATE comments SET likes = GREATEST(COALESCE(likes, 0) - 1, 0) WHERE id = ${commentId}`;
    revalidatePath(`/category/${categoryId}/post/${postId}`);
    return { unliked: true };
  }

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  await sql`INSERT INTO comment_likes (comment_id, ip_address, firebase_uid) VALUES (${commentId}, ${ip}, ${user.uid})`;
  await sql`UPDATE comments SET likes = COALESCE(likes, 0) + 1 WHERE id = ${commentId}`;
  revalidatePath(`/category/${categoryId}/post/${postId}`);
}
