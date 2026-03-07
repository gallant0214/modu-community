export const dynamic = "force-dynamic";

import { sql } from "@/app/lib/db";
import { NextRequest, NextResponse } from "next/server";

// GET /api/comments/my?author=닉네임
// 내가 댓글 단 게시글 목록 반환
export async function GET(req: NextRequest) {
  const author = req.nextUrl.searchParams.get("author")?.trim();
  if (!author) {
    return NextResponse.json({ posts: [] });
  }

  const rows = await sql`
    SELECT DISTINCT ON (p.id)
           p.id, p.category_id, p.title, p.content, p.author, p.region, p.tags,
           p.likes, p.comments_count, p.is_notice, p.views, p.created_at, p.updated_at,
           c.name as category_name
    FROM comments cm
    INNER JOIN posts p ON cm.post_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE cm.author = ${author}
    ORDER BY p.id, p.created_at DESC
    LIMIT 50
  `;

  // 최신순 정렬
  rows.sort((a: { created_at: string }, b: { created_at: string }) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return NextResponse.json({ posts: rows });
}
