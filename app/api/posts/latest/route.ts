import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 5, 50);
  const page = Math.max(Number(url.searchParams.get("page")) || 1, 1);
  const offset = (page - 1) * limit;

  // 페이지네이션 지원 (page 파라미터가 있을 때)
  if (url.searchParams.has("page")) {
    const countResult = await sql`
      SELECT COUNT(*)::int AS total
      FROM posts p
      WHERE (p.is_notice = false OR p.is_notice IS NULL)
    `;
    const total = countResult[0]?.total || 0;
    const totalPages = Math.ceil(total / limit) || 1;

    const posts = await sql`
      SELECT p.*, c.name AS category_name
      FROM posts p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE (p.is_notice = false OR p.is_notice IS NULL)
      ORDER BY p.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return NextResponse.json({ posts, page, totalPages, total });
  }

  // 기존: 단순 리스트 (홈 화면용)
  const posts = await sql`
    SELECT p.*, c.name AS category_name
    FROM posts p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE (p.is_notice = false OR p.is_notice IS NULL)
    ORDER BY p.created_at DESC
    LIMIT ${limit}
  `;

  return NextResponse.json(posts);
}
