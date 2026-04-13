import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";
import { cached } from "@/app/lib/cache";

export const dynamic = "force-dynamic";

export async function GET() {
  // 카테고리 목록은 자주 안 바뀌므로 5분 캐시
  const categories = await cached("categories:all", 300, () =>
    sql`
      SELECT c.*, COALESCE(p.cnt, 0) AS post_count
      FROM categories c
      LEFT JOIN (SELECT category_id, COUNT(*) AS cnt FROM posts WHERE is_notice = false OR is_notice IS NULL GROUP BY category_id) p
      ON c.id = p.category_id
      ORDER BY post_count DESC, c.name ASC
    `
  );
  return NextResponse.json(categories);
}
