"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { sql } from "./db";

export async function createPost(formData: FormData) {
  const categoryId = formData.get("category_id") as string;
  const title = formData.get("title") as string;
  const content = formData.get("content") as string;
  const author = formData.get("author") as string;
  const password = formData.get("password") as string;
  const region = formData.get("region") as string;
  const tags = formData.get("tags") as string;

  if (!title?.trim() || !content?.trim() || !author?.trim() || !password?.trim()) {
    return { error: "필수 항목을 입력해주세요" };
  }

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";

  await sql`INSERT INTO posts (category_id, title, content, author, password, region, tags, ip_address)
    VALUES (${Number(categoryId)}, ${title.trim()}, ${content.trim()}, ${author.trim()}, ${password.trim()}, ${(region || "전국").trim()}, ${(tags || "").trim()}, ${ip})`;
  revalidatePath(`/category/${categoryId}`);
  revalidatePath("/");
}

export async function likePost(id: number, categoryId: number) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";

  await sql`CREATE TABLE IF NOT EXISTS post_likes (
    id SERIAL PRIMARY KEY,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    ip_address TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(post_id, ip_address)
  )`;

  const existing = await sql`SELECT id FROM post_likes WHERE post_id = ${id} AND ip_address = ${ip}`;
  if (existing.length > 0) {
    await sql`DELETE FROM post_likes WHERE post_id = ${id} AND ip_address = ${ip}`;
    await sql`UPDATE posts SET likes = GREATEST(COALESCE(likes, 0) - 1, 0) WHERE id = ${id}`;
    revalidatePath(`/category/${categoryId}`);
    return { unliked: true };
  }

  await sql`INSERT INTO post_likes (post_id, ip_address) VALUES (${id}, ${ip})`;
  await sql`UPDATE posts SET likes = COALESCE(likes, 0) + 1 WHERE id = ${id}`;
  revalidatePath(`/category/${categoryId}`);
  return { unliked: false };
}

export async function viewPost(id: number) {
  await sql`UPDATE posts SET views = views + 1 WHERE id = ${id}`;
}

export async function updatePost(formData: FormData) {
  const id = formData.get("id") as string;
  const categoryId = formData.get("category_id") as string;
  const title = formData.get("title") as string;
  const content = formData.get("content") as string;
  const region = formData.get("region") as string;
  const tags = formData.get("tags") as string;

  if (!title?.trim() || !content?.trim()) {
    return { error: "제목과 내용을 입력해주세요" };
  }

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

  const isAdmin = password === process.env.ADMIN_PASSWORD;
  if (!isAdmin && rows[0].password !== password) {
    return { error: "비밀번호가 일치하지 않습니다" };
  }
  return { success: true };
}

export async function deletePost(id: number, categoryId: number, password: string) {
  const rows = await sql`SELECT password FROM posts WHERE id = ${id}`;
  if (rows.length === 0) return { error: "게시글을 찾을 수 없습니다" };

  const isAdmin = password === process.env.ADMIN_PASSWORD;
  if (!isAdmin && rows[0].password !== password) {
    return { error: "비밀번호가 일치하지 않습니다" };
  }

  await sql`DELETE FROM posts WHERE id = ${id}`;
  revalidatePath(`/category/${categoryId}`);
  revalidatePath("/");
}

export async function createComment(postId: number, categoryId: number, author: string, password: string, content: string, parentId?: number | null) {
  if (!author?.trim() || !password?.trim() || !content?.trim()) {
    return { error: "모든 항목을 입력해주세요" };
  }
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  await sql`INSERT INTO comments (post_id, parent_id, author, password, content, ip_address) VALUES (${postId}, ${parentId ?? null}, ${author.trim()}, ${password.trim()}, ${content.trim()}, ${ip})`;
  await sql`UPDATE posts SET comments_count = (SELECT COUNT(*) FROM comments WHERE post_id = ${postId}) WHERE id = ${postId}`;
  revalidatePath(`/category/${categoryId}/post/${postId}`);
  revalidatePath(`/category/${categoryId}`);
}

export async function deleteComment(commentId: number, postId: number, categoryId: number, password: string) {
  const rows = await sql`SELECT password FROM comments WHERE id = ${commentId}`;
  if (rows.length === 0) return { error: "댓글을 찾을 수 없습니다" };

  const isAdmin = password === process.env.ADMIN_PASSWORD;
  if (!isAdmin && rows[0].password !== password) {
    return { error: "비밀번호가 일치하지 않습니다" };
  }

  await sql`DELETE FROM comments WHERE id = ${commentId}`;
  await sql`UPDATE posts SET comments_count = (SELECT COUNT(*) FROM comments WHERE post_id = ${postId}) WHERE id = ${postId}`;
  revalidatePath(`/category/${categoryId}/post/${postId}`);
  revalidatePath(`/category/${categoryId}`);
}

export async function createInquiry(formData: FormData) {
  const author = formData.get("author") as string;
  const password = formData.get("password") as string;
  const email = formData.get("email") as string;
  const title = formData.get("title") as string;
  const content = formData.get("content") as string;

  if (!author?.trim() || !password?.trim() || !email?.trim() || !title?.trim() || !content?.trim()) {
    return { error: "모든 항목을 입력해주세요" };
  }

  // email 컬럼이 없으면 추가
  await sql`ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS email TEXT DEFAULT ''`;
  await sql`INSERT INTO inquiries (author, password, email, title, content) VALUES (${author.trim()}, ${password.trim()}, ${email.trim()}, ${title.trim()}, ${content.trim()})`;
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
  if (adminPassword !== process.env.ADMIN_PASSWORD) {
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
  if (adminPassword !== process.env.ADMIN_PASSWORD) {
    return { error: "관리자 비밀번호가 일치하지 않습니다" };
  }
  if (!replyContent?.trim()) {
    return { error: "답글 내용을 입력해주세요" };
  }
  await sql`UPDATE inquiries SET reply = ${replyContent.trim()}, replied_at = NOW() WHERE id = ${id}`;
  revalidatePath("/inquiry");
}

export async function updateInquiry(id: number, password: string, title: string, content: string) {
  const rows = await sql`SELECT password FROM inquiries WHERE id = ${id}`;
  if (rows.length === 0) return { error: "문의를 찾을 수 없습니다" };

  const isAdmin = password === process.env.ADMIN_PASSWORD;
  if (!isAdmin && rows[0].password !== password) {
    return { error: "비밀번호가 일치하지 않습니다" };
  }
  if (!title?.trim() || !content?.trim()) {
    return { error: "제목과 내용을 입력해주세요" };
  }

  await sql`UPDATE inquiries SET title = ${title.trim()}, content = ${content.trim()} WHERE id = ${id}`;
  revalidatePath("/inquiry");
}

export async function updateNotice(id: number, adminPassword: string, title: string, content: string) {
  if (adminPassword !== process.env.ADMIN_PASSWORD) {
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
  customReason?: string
) {
  if (!reason?.trim()) return { error: "신고 사유를 선택해주세요" };
  await sql`INSERT INTO reports (target_type, target_id, post_id, category_id, reason, custom_reason)
    VALUES (${targetType}, ${targetId}, ${postId}, ${categoryId}, ${reason.trim()}, ${customReason?.trim() || null})`;
}

export async function getReports(adminPassword: string) {
  if (adminPassword !== process.env.ADMIN_PASSWORD) {
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
  if (adminPassword !== process.env.ADMIN_PASSWORD) {
    return { error: "관리자 비밀번호가 일치하지 않습니다" };
  }
  const rows = await sql`
    SELECT id, author, email, title, content, reply, replied_at, hidden, created_at
    FROM inquiries ORDER BY created_at DESC
  `;
  return { inquiries: rows };
}

export async function resolveReport(id: number, adminPassword: string) {
  if (adminPassword !== process.env.ADMIN_PASSWORD) {
    return { error: "관리자 비밀번호가 일치하지 않습니다" };
  }
  await sql`UPDATE reports SET resolved = true, resolved_at = NOW() WHERE id = ${id}`;
}

export async function deleteReportTarget(reportId: number, adminPassword: string) {
  if (adminPassword !== process.env.ADMIN_PASSWORD) {
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
  if (adminPassword !== process.env.ADMIN_PASSWORD) {
    return { error: "관리자 비밀번호가 일치하지 않습니다" };
  }
  await sql`UPDATE inquiries SET hidden = true WHERE id = ${id}`;
  revalidatePath("/inquiry");
}

export async function unhideInquiry(id: number, adminPassword: string) {
  if (adminPassword !== process.env.ADMIN_PASSWORD) {
    return { error: "관리자 비밀번호가 일치하지 않습니다" };
  }
  await sql`UPDATE inquiries SET hidden = false WHERE id = ${id}`;
  revalidatePath("/inquiry");
}

export async function deleteInquiry(id: number, password: string) {
  const rows = await sql`SELECT password FROM inquiries WHERE id = ${id}`;
  if (rows.length === 0) return { error: "문의를 찾을 수 없습니다" };

  const isAdmin = password === process.env.ADMIN_PASSWORD;
  if (!isAdmin && rows[0].password !== password) {
    return { error: "비밀번호가 일치하지 않습니다" };
  }

  await sql`DELETE FROM inquiries WHERE id = ${id}`;
  revalidatePath("/inquiry");
}

export async function updateComment(commentId: number, postId: number, categoryId: number, password: string, content: string) {
  if (!content?.trim()) return { error: "내용을 입력해주세요" };
  if (!password?.trim()) return { error: "비밀번호를 입력해주세요" };

  const rows = await sql`SELECT password FROM comments WHERE id = ${commentId}`;
  if (rows.length === 0) return { error: "댓글을 찾을 수 없습니다" };

  const isAdmin = password === process.env.ADMIN_PASSWORD;
  if (!isAdmin && rows[0].password !== password) {
    return { error: "비밀번호가 일치하지 않습니다" };
  }

  await sql`UPDATE comments SET content = ${content.trim()} WHERE id = ${commentId}`;
  revalidatePath(`/category/${categoryId}/post/${postId}`);
}

export async function likeComment(commentId: number, postId: number, categoryId: number) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";

  // 이미 공감했는지 확인 → 토글
  const existing = await sql`SELECT id FROM comment_likes WHERE comment_id = ${commentId} AND ip_address = ${ip}`;
  if (existing.length > 0) {
    await sql`DELETE FROM comment_likes WHERE comment_id = ${commentId} AND ip_address = ${ip}`;
    await sql`UPDATE comments SET likes = GREATEST(COALESCE(likes, 0) - 1, 0) WHERE id = ${commentId}`;
    revalidatePath(`/category/${categoryId}/post/${postId}`);
    return { unliked: true };
  }

  await sql`INSERT INTO comment_likes (comment_id, ip_address) VALUES (${commentId}, ${ip})`;
  await sql`UPDATE comments SET likes = COALESCE(likes, 0) + 1 WHERE id = ${commentId}`;
  revalidatePath(`/category/${categoryId}/post/${postId}`);
}
