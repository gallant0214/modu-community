import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";
import { cached } from "@/app/lib/cache";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 5, 50);
  const page = Math.max(Number(url.searchParams.get("page")) || 1, 1);
  const offset = (page - 1) * limit;

  // 페이지네이션 지원 (60초 캐시)
  if (url.searchParams.has("page")) {
    const result = await cached(`posts:latest:p:${page}:l:${limit}`, 60, async () => {
      const countResult = await sql`
        SELECT COUNT(*)::int AS total FROM posts p
        WHERE (p.is_notice = false OR p.is_notice IS NULL)
      `;
      const total = countResult[0]?.total || 0;
      const totalPages = Math.ceil(total / limit) || 1;
      const posts = await sql`
        SELECT p.*, c.name AS category_name FROM posts p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE (p.is_notice = false OR p.is_notice IS NULL)
        ORDER BY p.created_at DESC LIMIT ${limit} OFFSET ${offset}
      `;
      return { posts, page, totalPages, total };
    });
    return NextResponse.json(result);
  }

  // 홈 화면용 (60초 캐시)
  const posts = await cached(`posts:latest:home:${limit}`, 60, () =>
    sql`
      SELECT p.*, c.name AS category_name FROM posts p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE (p.is_notice = false OR p.is_notice IS NULL)
      ORDER BY p.created_at DESC LIMIT ${limit}
    `
  );
  return NextResponse.json(posts);
}
